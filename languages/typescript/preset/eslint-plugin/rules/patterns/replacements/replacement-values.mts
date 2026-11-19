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
import { textReceiverOf } from '../replace-chains.mts';

type Node = TSESTree.Node;
export type TypeOf = (node: Node) => TypeScript.Type;

const MAX_DEPTH = 4;
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
  return textReceiverOf(node, TEXT_METHODS);
}

function hasDollar(node: TSESTree.TemplateLiteral): boolean {
  return node.quasis.some((quasi) => quasi.value.cooked?.includes('$') === true);
}

type ReplacementEnv = { readonly context: SourceContext; readonly typeOf: TypeOf };
type Plan = { readonly settled: boolean; readonly needs: readonly Node[] | undefined };
type Visit = { readonly node: Node; readonly depth: number };
type Record = {
  readonly settled: boolean;
  readonly needsAll: boolean;
  readonly children: number[];
};

const SETTLED: Plan = { settled: true, needs: undefined };
const UNSAFE: Plan = { settled: false, needs: undefined };

function structurePlan(target: Node): Plan {
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    return hasDollar(target) ? SETTLED : { settled: false, needs: target.expressions };
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    const operands = operandsOf(target, '+');
    if (operands.some((operand) => stringValue(operand)?.includes('$') === true)) {
      return SETTLED;
    }
    return target.operator === '+' ? { settled: false, needs: operands } : UNSAFE;
  }
  if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    return { settled: false, needs: [target.consequent, target.alternate] };
  }
  if (target.type !== AST_NODE_TYPES.CallExpression) {
    return UNSAFE;
  }
  const source = textSource(target);
  if (isEscapingReplace(target) || ESCAPE_NAME.test(calleeNameOf(target.callee) ?? '')) {
    return SETTLED;
  }
  return source === undefined ? UNSAFE : { settled: false, needs: [source] };
}

function planFor(env: ReplacementEnv, { node, depth }: Visit): Plan {
  const { context, typeOf } = env;
  const target = unwrapped(resolveConstant(context, unwrapped(node)));
  if (target === undefined || depth > MAX_DEPTH) {
    return UNSAFE;
  }
  if (stringValue(target) !== undefined || isPlainType(typeOf(target))) {
    return SETTLED;
  }
  return structurePlan(target);
}

function expand(env: ReplacementEnv, root: Node): Record[] {
  const visits: Visit[] = [{ node: root, depth: 0 }];
  const records: Record[] = [];
  for (const visit of visits) {
    const plan = planFor(env, visit);
    const needs = plan.needs ?? [];
    const first = visits.length;
    for (const child of needs) {
      visits.push({ node: child, depth: visit.depth + 1 });
    }
    records.push({
      settled: plan.settled,
      needsAll: plan.needs !== undefined,
      children: needs.map((_, offset) => first + offset),
    });
  }
  return records;
}

function isSafeNode(env: ReplacementEnv, root: Node): boolean {
  const safe = new Map<number, boolean>();
  for (const [index, record] of [...expand(env, root).entries()].toReversed()) {
    const childrenSafe = record.children.every((child) => safe.get(child) === true);
    safe.set(index, record.settled || (record.needsAll && childrenSafe));
  }
  return safe.get(0) === true;
}

export function isSafeReplacement(context: SourceContext, typeOf: TypeOf, node: Node): boolean {
  return isSafeNode({ context, typeOf }, node);
}
