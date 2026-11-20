import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameText, wordsOf } from './names.mts';

const BOUNDARY_CHARACTERS = '/\\.:-_@?#=&';
const SEPARATOR_WORDS = new Set(['sep', 'separator', 'slash', 'delimiter']);
const MAX_DEPTH = 6;

function endsWithBoundaryCharacter(text: string): boolean {
  return text === '' || BOUNDARY_CHARACTERS.includes(text.at(-1) ?? '');
}

function namesSeparator(node: TSESTree.Node): boolean {
  const name = nameText(node);
  return name !== undefined && wordsOf(name).some((word) => SEPARATOR_WORDS.has(word));
}

type Pending = { readonly node: TSESTree.Node; readonly depth: number };
type Step = { readonly ends: boolean; readonly next: readonly TSESTree.Node[] };

const SEPARATOR_STEP: Step = { ends: true, next: [] };
const PLAIN_STEP: Step = { ends: false, next: [] };
const JOINING_CALLS = new Set(['concat', 'join', 'resolve']);

function templateStep(node: TSESTree.TemplateLiteral): Step {
  const last = node.quasis.at(-1)?.value.cooked ?? '';
  const expression = node.expressions.at(-1);
  if (last !== '') {
    return { ends: endsWithBoundaryCharacter(last), next: [] };
  }
  return expression === undefined ? SEPARATOR_STEP : { ends: false, next: [expression] };
}

function callStep(node: TSESTree.CallExpression): Step {
  if (namesSeparator(node.callee)) {
    return SEPARATOR_STEP;
  }
  const name = nameText(node.callee);
  const last = node.arguments.at(-1);
  return name !== undefined && JOINING_CALLS.has(name) && last !== undefined
    ? { ends: false, next: [last] }
    : PLAIN_STEP;
}

function assignedStep(context: SourceContext, node: TSESTree.Identifier): Step {
  const references = findVariable(context, node, node.name)?.references ?? [];
  return {
    ends: false,
    next: references.flatMap((reference) => {
      const written = reference.writeExpr ?? undefined;
      return written === undefined ? [] : [written];
    }),
  };
}

function operandsOf(node: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {
    return [node.right];
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return [node.consequent, node.alternate];
  }
  return node.type === AST_NODE_TYPES.LogicalExpression ? [node.left, node.right] : undefined;
}

function boundaryStep(context: SourceContext, resolved: TSESTree.Node): Step {
  const text = stringValue(resolved);
  if (text !== undefined) {
    return { ends: endsWithBoundaryCharacter(text), next: [] };
  }
  if (resolved.type === AST_NODE_TYPES.TemplateLiteral) {
    return templateStep(resolved);
  }
  if (resolved.type === AST_NODE_TYPES.CallExpression) {
    return callStep(resolved);
  }
  const operands = operandsOf(resolved);
  if (operands !== undefined) {
    return { ends: false, next: operands };
  }
  if (namesSeparator(resolved)) {
    return SEPARATOR_STEP;
  }
  return resolved.type === AST_NODE_TYPES.Identifier ? assignedStep(context, resolved) : PLAIN_STEP;
}

export function endsWithBoundary(context: SourceContext, node: TSESTree.Node): boolean {
  const pending: Pending[] = [{ node, depth: 0 }];
  for (const item of pending) {
    if (item.depth > MAX_DEPTH) {
      return true;
    }
    const step = boundaryStep(context, resolveConstant(context, item.node) ?? item.node);
    if (step.ends) {
      return true;
    }
    for (const next of step.next) {
      pending.push({ node: next, depth: item.depth + 1 });
    }
  }
  return false;
}

export function startsWithBoundary(context: SourceContext, node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    const resolved = resolveConstant(context, item) ?? item;
    const text = stringValue(resolved);
    if (text !== undefined) {
      return text === '' || '.@/'.includes(text[0] ?? '');
    }
    if (resolved.type === AST_NODE_TYPES.TemplateLiteral) {
      return (
        (resolved.quasis[0]?.value.cooked ?? '') !== '' &&
        '.@/'.includes(resolved.quasis[0]?.value.cooked?.[0] ?? '')
      );
    }
    if (resolved.type === AST_NODE_TYPES.BinaryExpression && resolved.operator === '+') {
      pending.push(resolved.left);
    }
  }
  return false;
}
