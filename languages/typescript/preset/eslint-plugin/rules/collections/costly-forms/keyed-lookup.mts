import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, chainOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import {
  contains,
  equalitySides,
  memberName,
  methodCallOn,
  referencesName,
  someNode,
  repeatedRole,
  returnedExpression,
  singleParameter,
  unwrapped,
} from './repeated-runs.mts';
import {
  fieldNameOf,
  isAssignmentTarget,
  isDedupeComparison,
  isPrivateField,
  isReadOnlyUse,
} from './receivers/read-only-uses.mts';

type Finding = TSESLint.ReportDescriptor<'lookupInLoop'>;

const { DefinitionType } = TSESLint.Scope;

const LOOKUPS = new Set(['find', 'findIndex', 'findLast', 'findLastIndex', 'some']);
const MUTATORS = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

function keyPath(node: TSESTree.Node, parameter: string): string | undefined {
  const chain = chainOf<TSESTree.Node>(unwrapped(node), (current) =>
    current.type === AST_NODE_TYPES.MemberExpression ? unwrapped(current.object) : undefined,
  );
  const root = chain.at(-1);
  const keys = chain.slice(0, -1).map(memberName).reverse();
  if (chain.length < 2 || root?.type !== AST_NODE_TYPES.Identifier || root.name !== parameter) {
    return undefined;
  }
  return keys.includes(undefined) ? undefined : keys.join('.');
}

function isConstantValue(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    value.type === AST_NODE_TYPES.Literal ||
    (value.type === AST_NODE_TYPES.TemplateLiteral && value.expressions.length === 0)
  );
}

function lookupKey(callback: TSESTree.Node): string | undefined {
  const parameter = singleParameter(callback);
  const sides = parameter === undefined ? undefined : equalitySides(returnedExpression(callback));
  if (parameter === undefined || sides === undefined) {
    return undefined;
  }
  const [left, right] = sides;
  const candidates: [string | undefined, TSESTree.Node][] = [
    [keyPath(left, parameter), right],
    [keyPath(right, parameter), left],
  ];
  const keyed = candidates.find(
    ([key, other]) => key !== undefined && !referencesName(other, parameter),
  );
  return keyed === undefined || isConstantValue(keyed[1]) ? undefined : keyed[0];
}

function isMutation(node: TSESTree.Node): boolean {
  const method = methodCallOn(node);
  if (method === undefined) {
    return false;
  }
  if (method.call !== undefined) {
    return method.name !== undefined && MUTATORS.has(method.name);
  }
  return isAssignmentTarget(method.member);
}

function variableReceiver(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): TSESTree.Node | undefined {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs[0];
  if (
    variable === undefined ||
    definition === undefined ||
    (definition.type !== DefinitionType.Variable && definition.type !== DefinitionType.Parameter)
  ) {
    return undefined;
  }
  const references = variable.references.filter((reference) => !reference.init);
  const changed = references.some(
    (reference) =>
      reference.isWrite() ||
      isMutation(reference.identifier) ||
      !isReadOnlyUse(reference.identifier),
  );
  if (changed) {
    return undefined;
  }
  return definition.type === DefinitionType.Variable ? definition.parent : definition.node;
}

function thisField(member: TSESTree.MemberExpression): string | undefined {
  const object = unwrapped(member.object);
  return object.type === AST_NODE_TYPES.ThisExpression ? fieldNameOf(member) : undefined;
}

function isConstructorCode(node: TSESTree.Node, classBody: TSESTree.ClassBody): boolean {
  const method = classBody.body.find((element) => contains(element, node));
  return method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'constructor';
}

function changesField(node: TSESTree.Node, field: string, classBody: TSESTree.ClassBody): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || thisField(node) !== field) {
    return false;
  }
  if (isAssignmentTarget(node)) {
    return !isConstructorCode(node, classBody);
  }
  return isMutation(node) || !isReadOnlyUse(node);
}

function fieldReceiver(member: TSESTree.MemberExpression): TSESTree.ClassBody | undefined {
  const field = thisField(member);
  const classBody = ancestorsOf(member).find(
    (node): node is TSESTree.ClassBody => node.type === AST_NODE_TYPES.ClassBody,
  );
  if (field === undefined || classBody === undefined || !isPrivateField(classBody, field)) {
    return undefined;
  }
  return someNode(classBody, (node) => changesField(node, field, classBody))
    ? undefined
    : classBody;
}

function receiverBoundary(
  sourceCode: SourceCode,
  receiver: TSESTree.Node,
): TSESTree.Node | undefined {
  if (receiver.type === AST_NODE_TYPES.Identifier) {
    return variableReceiver(sourceCode, receiver);
  }
  return receiver.type === AST_NODE_TYPES.MemberExpression ? fieldReceiver(receiver) : undefined;
}

function isDedupe(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  return isDedupeComparison(call, (identifier) => {
    const definition = variableNamed(sourceCode, identifier)?.defs[0];
    return (
      definition?.type === DefinitionType.Parameter &&
      'params' in definition.node &&
      definition.node.params[1] === definition.name
    );
  });
}

export function keyedLookup(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): Finding | undefined {
  const callee = unwrapped(call.callee);
  const method = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  const [argument] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    method === undefined ||
    !LOOKUPS.has(method) ||
    argument === undefined ||
    call.arguments.length !== 1
  ) {
    return undefined;
  }
  const key = lookupKey(argument);
  const receiver = unwrapped(callee.object);
  const boundary = key === undefined ? undefined : receiverBoundary(sourceCode, receiver);
  if (key === undefined || boundary === undefined) {
    return undefined;
  }
  const role = repeatedRole(call, boundary);
  if (role === undefined || role === 'handler' || isDedupe(sourceCode, call)) {
    return undefined;
  }
  return {
    node: call,
    messageId: 'lookupInLoop',
    data: { name: sourceCode.getText(receiver), method, key },
  };
}
