import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { unwrapped } from '../../security/security-values.mts';
import { calleeNameOf, operandsOf } from '../../typed/syntax-views.mts';
import { ts } from '../../typed/typescript-views.mts';

type Node = TSESTree.Node;
export type TypeOf = (node: Node) => TypeScript.Type;

const ESCAPE_NAME = /escape|quote/iu;
const REPLACE_METHODS = new Set<string>(['replace', 'replaceAll']);
const TEXT_METHODS = new Set<string>(['toString', 'toFixed', 'toPrecision', 'toLocaleString']);
const PLAIN_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;

function parts(type: TypeScript.Type): readonly TypeScript.Type[] {
  return type.isUnion() ? type.types : [type];
}

function isPlainType(type: TypeScript.Type): boolean {
  return parts(type).every(
    (part) =>
      (part.flags & PLAIN_FLAGS) !== 0 || (part.isStringLiteral() && !part.value.includes('$')),
  );
}

export function isStringType(type: TypeScript.Type): boolean {
  return parts(type).every((part) => (part.flags & ts.TypeFlags.StringLike) !== 0);
}

export function isCallable(type: TypeScript.Type): boolean {
  return parts(type).some((part) => part.getCallSignatures().length > 0);
}

function isEscapingReplace(node: TSESTree.CallExpression): boolean {
  const [pattern] = node.arguments;
  const method = calleeNameOf(node.callee) ?? '';
  return (
    REPLACE_METHODS.has(method) &&
    pattern !== undefined &&
    (stringValue(pattern)?.includes('$') === true ||
      (pattern.type === AST_NODE_TYPES.Literal &&
        'regex' in pattern &&
        pattern.regex.pattern.includes('\\$')))
  );
}

function textSource(node: TSESTree.CallExpression): Node | undefined {
  if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
    return TEXT_METHODS.has(calleeNameOf(node.callee) ?? '') ? node.callee.object : undefined;
  }
  return node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'String' &&
    node.arguments.length === 1
    ? node.arguments[0]
    : undefined;
}

function hasDollar(node: TSESTree.TemplateLiteral): boolean {
  return node.quasis.some((quasi) => quasi.value.cooked?.includes('$') === true);
}

interface ReplacementEnv {
  context: SourceContext;
  typeOf: TypeOf;
  depth: number;
}

function isSafeStructure(env: ReplacementEnv, target: Node): boolean {
  const next = (child: Node) => isSafeNode({ ...env, depth: env.depth + 1 }, child);
  switch (target.type) {
    case AST_NODE_TYPES.TemplateLiteral:
      return hasDollar(target) || target.expressions.every(next);
    case AST_NODE_TYPES.BinaryExpression:
      return (
        operandsOf(target, '+').some((operand) => stringValue(operand)?.includes('$') === true) ||
        (target.operator === '+' && operandsOf(target, '+').every(next))
      );
    case AST_NODE_TYPES.ConditionalExpression:
      return next(target.consequent) && next(target.alternate);
    case AST_NODE_TYPES.CallExpression: {
      const source = textSource(target);
      return (
        isEscapingReplace(target) ||
        ESCAPE_NAME.test(calleeNameOf(target.callee) ?? '') ||
        (source !== undefined && next(source))
      );
    }
    default:
      return false;
  }
}

function isSafeNode(env: ReplacementEnv, node: Node): boolean {
  const { context, typeOf, depth } = env;
  const target = unwrapped(resolveConstant(context, unwrapped(node)));
  if (target === undefined || depth > 4) {
    return false;
  }
  return (
    stringValue(target) !== undefined || isPlainType(typeOf(target)) || isSafeStructure(env, target)
  );
}

export function isSafeReplacement(context: SourceContext, typeOf: TypeOf, node: Node): boolean {
  return isSafeNode({ context, typeOf, depth: 0 }, node);
}
