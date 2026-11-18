import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { unwrapped } from '../../security/security-values.mts';
import { calleeNameOf, operandsOf } from '../../typed/syntax-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { fragmentOf, isMarkup } from './html-parts.mts';

type Node = TSESTree.Node;
export type TypeOf = ((node: Node) => TypeScript.Type) | undefined;

const SAFE_CALL = /escape|encode|sanitize|html|markup/iu;
const SAFE_NAME =
  /html|markup|escaped|encoded|sanitized|safe|class|nonce|color|icon|attribute|tag$|css|children|rendered/iu;
const PLAIN_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;
const NUMBER_CALLS = new Set<string>([
  'Number',
  'parseInt',
  'parseFloat',
  'toFixed',
  'toPrecision',
]);
const NUMBER_PROPERTIES = new Set<string>(['length', 'size', 'count']);
const MAX_DEPTH = 5;

function isPlainType(type: TypeScript.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.every(
    (part) =>
      (part.flags & PLAIN_FLAGS) !== 0 || (part.isStringLiteral() && !/[<>&"'`]/u.test(part.value)),
  );
}

function isMarkupFragment(node: Node): boolean {
  const fragment = fragmentOf(node);
  return fragment !== undefined && isMarkup(fragment.texts);
}

function isMappedJoin(node: TSESTree.CallExpression): boolean {
  const receiver =
    node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined;
  return (
    calleeNameOf(node.callee) === 'join' &&
    receiver?.type === AST_NODE_TYPES.CallExpression &&
    calleeNameOf(receiver.callee) === 'map'
  );
}

const ENTITY = /&(?:lt|gt|amp|quot|#\d+|#x[0-9a-f]+);/iu;

function isEntityReplace(node: TSESTree.CallExpression): boolean {
  return (
    ['replace', 'replaceAll'].includes(calleeNameOf(node.callee) ?? '') &&
    node.arguments.some((argument) => ENTITY.test(stringValue(argument) ?? ''))
  );
}

function rootNames(node: Node): string[] {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return [calleeNameOf(node.callee) ?? '', ...rootNames(node.callee)];
  }
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return rootNames(node.argument);
  }
  return node.type === AST_NODE_TYPES.MemberExpression ? rootNames(node.object) : [];
}

function isSafeJoin(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    calleeNameOf(callee) === 'join' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    SAFE_NAME.test(callee.object.name)
  );
}

function safeCall(node: TSESTree.CallExpression): boolean {
  const name = calleeNameOf(node.callee) ?? '';
  const owner =
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier
      ? node.callee.object.name
      : '';
  return (
    rootNames(node).some((root) => SAFE_CALL.test(root)) ||
    SAFE_CALL.test(owner) ||
    NUMBER_CALLS.has(name) ||
    isMappedJoin(node) ||
    isSafeJoin(node) ||
    isEntityReplace(node) ||
    owner === 'Math'
  );
}

function writesAreSafe(
  context: SourceContext,
  node: TSESTree.Identifier,
  isSafe: (value: Node) => boolean,
): boolean {
  const variable = findVariable(context, node, node.name);
  const declared = variable?.defs.every(
    (definition) =>
      definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
      definition.node.id.type === AST_NODE_TYPES.Identifier,
  );
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  return (
    declared === true &&
    writes.length > 0 &&
    writes.every(({ writeExpr }) => writeExpr != null && isSafe(writeExpr))
  );
}

function chainNames(node: Node): string[] {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return [];
  }
  const own =
    !node.computed && node.property.type === AST_NODE_TYPES.Identifier ? [node.property.name] : [];
  return [...own, ...chainNames(node.object)];
}

interface SafeEnv {
  context: SourceContext;
  typeOf: TypeOf;
  depth: number;
}

function isSafeMember(target: TSESTree.MemberExpression): boolean {
  return (
    chainNames(target).some((name) => SAFE_NAME.test(name)) ||
    (!target.computed &&
      target.property.type === AST_NODE_TYPES.Identifier &&
      NUMBER_PROPERTIES.has(target.property.name))
  );
}

function isSafeStructure(env: SafeEnv, target: Node): boolean {
  const next = (child: Node) => isSafeNode({ ...env, depth: env.depth + 1 }, child);
  switch (target.type) {
    case AST_NODE_TYPES.TemplateLiteral:
      return isMarkupFragment(target) || target.expressions.every(next);
    case AST_NODE_TYPES.BinaryExpression:
      return (
        target.operator !== '+' || isMarkupFragment(target) || operandsOf(target, '+').every(next)
      );
    case AST_NODE_TYPES.Identifier:
      return SAFE_NAME.test(target.name) || writesAreSafe(env.context, target, next);
    case AST_NODE_TYPES.MemberExpression:
      return isSafeMember(target);
    case AST_NODE_TYPES.CallExpression:
      return safeCall(target);
    case AST_NODE_TYPES.ConditionalExpression:
      return next(target.consequent) && next(target.alternate);
    case AST_NODE_TYPES.LogicalExpression:
      return next(target.left) && next(target.right);
    case AST_NODE_TYPES.UnaryExpression:
      return true;
    default:
      return false;
  }
}

function isSafeNode(env: SafeEnv, node: Node): boolean {
  const { context, typeOf, depth } = env;
  const named = unwrapped(node);
  if (named.type === AST_NODE_TYPES.Identifier && SAFE_NAME.test(named.name)) {
    return true;
  }
  const target = unwrapped(resolveConstant(context, named));
  if (target === undefined || depth > MAX_DEPTH) {
    return false;
  }
  if (target.type === AST_NODE_TYPES.Literal || stringValue(target) !== undefined) {
    return true;
  }
  return (typeOf !== undefined && isPlainType(typeOf(target))) || isSafeStructure(env, target);
}

export function isSafeValue(context: SourceContext, typeOf: TypeOf, node: Node): boolean {
  return isSafeNode({ context, typeOf, depth: 0 }, node);
}
