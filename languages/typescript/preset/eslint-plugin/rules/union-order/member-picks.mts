import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../analysis/ancestry.mts';
import { typeServices, type Context } from '../security/security-values.mts';
import { isPresenceOnly, outermost } from '../type-lookups/lookup-sites.mts';
import { chainOf } from '../typed/node-views.mts';
import { picksAtMostOne } from './unique-members.mts';

const MEMBER_LIST_TYPES = new Set(['UnionType', 'IntersectionType', 'UnionOrIntersectionType']);
const PASS_THROUGH = new Set(['filter', 'map', 'flatMap', 'slice']);
const PICKS = new Set(['find', 'findLast']);
const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.Program,
]);

export type Pick = { readonly node: TSESTree.Node; readonly form: string };

function isTypeScriptDeclared(fileName: string): boolean {
  return /[/\\]node_modules[/\\]typescript[/\\]/u.test(fileName);
}

export function isMemberList(context: Context, member: TSESTree.MemberExpression): boolean {
  const services = typeServices(context);
  if (
    services === undefined ||
    member.computed ||
    member.property.type !== AST_NODE_TYPES.Identifier ||
    member.property.name !== 'types'
  ) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(member.object));
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  return (
    symbol !== undefined &&
    MEMBER_LIST_TYPES.has(symbol.name) &&
    (symbol.declarations ?? []).some((declaration) =>
      isTypeScriptDeclared(declaration.getSourceFile().fileName),
    )
  );
}

function calledMethod(
  node: TSESTree.Node,
): { name: string; call: TSESTree.CallExpression } | undefined {
  const member = outermost(node).parent;
  if (
    member?.type !== AST_NODE_TYPES.MemberExpression ||
    member.object !== outermost(node) ||
    member.computed ||
    member.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const call = outermost(member).parent;
  return call?.type === AST_NODE_TYPES.CallExpression && call.callee === outermost(member)
    ? { name: member.property.name, call }
    : undefined;
}

function isEdgeIndex(node: TSESTree.Node | undefined): boolean {
  if (node?.type === AST_NODE_TYPES.Literal) {
    return node.value === 0;
  }
  return (
    node?.type === AST_NODE_TYPES.UnaryExpression &&
    node.operator === '-' &&
    node.argument.type === AST_NODE_TYPES.Literal &&
    node.argument.value === 1
  );
}

function builtFromEntries(call: TSESTree.CallExpression): string | undefined {
  const parent = outermost(call).parent;
  if (parent?.type === AST_NODE_TYPES.NewExpression && parent.arguments[0] === outermost(call)) {
    return parent.callee.type === AST_NODE_TYPES.Identifier && parent.callee.name === 'Map'
      ? '`new Map(...)` over `.types.flatMap(...)`'
      : undefined;
  }
  return parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === outermost(call) &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    parent.callee.object.type === AST_NODE_TYPES.Identifier &&
    parent.callee.object.name === 'Object' &&
    parent.callee.property.type === AST_NODE_TYPES.Identifier &&
    parent.callee.property.name === 'fromEntries'
    ? '`Object.fromEntries(...)` over `.types.flatMap(...)`'
    : undefined;
}

function syntaxPick(value: TSESTree.Node): Pick | undefined {
  const { parent } = value;
  if (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === value &&
    parent.computed &&
    isEdgeIndex(parent.property)
  ) {
    return isPresenceOnly(parent) ? undefined : { node: parent, form: '`.types[0]`' };
  }
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === value &&
    parent.id.type === AST_NODE_TYPES.ArrayPattern
    ? { node: parent, form: 'Destructuring the first item of `.types`' }
    : undefined;
}

function methodPick(name: string, call: TSESTree.CallExpression): Pick | undefined {
  if (name === 'at' && isEdgeIndex(call.arguments[0])) {
    return isPresenceOnly(call) ? undefined : { node: call, form: '`.types.at(...)`' };
  }
  return PICKS.has(name) && !isPresenceOnly(call) && !picksAtMostOne(call.arguments[0])
    ? { node: call, form: `\`.types.${name}(...)\`` }
    : undefined;
}

type MethodCall = { readonly name: string; readonly call: TSESTree.CallExpression };

function passThroughCall(node: TSESTree.Node): MethodCall | undefined {
  const method = calledMethod(node);
  return method !== undefined && PASS_THROUGH.has(method.name) ? method : undefined;
}

function builtPick(calls: readonly MethodCall[]): Pick | undefined {
  const firstFlat = calls.findIndex((step) => step.name === 'flatMap');
  const built = (firstFlat === -1 ? [] : calls.slice(firstFlat))
    .map(({ call }) => ({ node: call, form: builtFromEntries(call) }))
    .find((candidate) => candidate.form !== undefined);
  return built?.form === undefined ? undefined : { node: built.node, form: built.form };
}

function pickOn(member: TSESTree.Node): Pick | undefined {
  const calls = chainOf<MethodCall>(passThroughCall(member), (step) => passThroughCall(step.call));
  const built = builtPick(calls);
  if (built !== undefined) {
    return built;
  }
  const last = calls.at(-1)?.call ?? member;
  const method = calledMethod(last);
  return method === undefined ? syntaxPick(outermost(last)) : methodPick(method.name, method.call);
}

function guardedSingleMember(context: Context, member: TSESTree.MemberExpression): boolean {
  const current = ancestorsOf(member).find((ancestor) => FUNCTION_TYPES.has(ancestor.type));
  const owner = context.sourceCode
    .getText(member.object)
    .replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const guard = new RegExp(`${owner}\\.types\\.length\\s*[!=]==?\\s*1\\b`, 'u');
  return guard.test(context.sourceCode.getText(current ?? member));
}

export function orderedPick(context: Context, member: TSESTree.MemberExpression): Pick | undefined {
  const pick = pickOn(member);
  return pick === undefined || guardedSingleMember(context, member) ? undefined : pick;
}
