import { chainFrom, depthFirst } from '../typed/typed-scan.mts';
import { expressionRanges } from './expression-ranges.mts';
import { rangeTree } from './expression-trees.mts';
import { closingTokens, kotlinTokens } from './kotlin-tokens.mts';
import type { Scanned } from '../typed/scan-shapes.mts';
import type {
  CompoundPair,
  ExpressionRange,
  Forest,
  Token,
  Tree,
} from '../typed/operand-shapes.mts';

const MIRRORED = new Map<string, string>([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);
const SYMMETRIC = new Set(['==', '!=', '===', '!==']);
const WRITES = new Set(['++', '--', '=', '+=', '-=', '*=', '/=', '%=']);
const CALLERS = new Set(['word', 'string', 'char', 'number']);
const OPERATOR_WORDS = new Set(['in', 'is', 'as', 'and', 'or', 'xor', 'return']);
const PURE_INFIX = new Set([
  'and',
  'or',
  'xor',
  'shl',
  'shr',
  'ushr',
  'until',
  'downTo',
  'step',
  'to',
  'rangeTo',
  'rangeUntil',
]);
const LITERAL_WORDS = new Set(['true', 'false', 'null']);
const MEMBER_MARKS = new Set(['.', '?.', '::']);

export function expressionNodes(root: Tree): Iterable<Tree> {
  return depthFirst(root, (node: Tree) =>
    node.operator === undefined ? [] : [node.left, node.right],
  );
}

function soleGroup(forest: Forest, node: Tree): Tree | undefined {
  if (node.operator !== undefined) {
    return undefined;
  }
  const [item] = node.items;
  const isGroup = item !== undefined && node.items.length === 1 && item.close !== undefined;
  return isGroup && forest.tokens[item.token]?.text === '('
    ? forest.byGroup.get(item.token)
    : undefined;
}

function linkGroups(forest: Forest): void {
  const leaves = forest.roots.flatMap((root) => [...expressionNodes(root)]);
  for (const leaf of leaves) {
    const inner = soleGroup(forest, leaf);
    if (inner !== undefined) {
      inner.parent = leaf.parent;
    }
  }
}

function markInfixCall(forest: Forest, node: Tree): void {
  if (node.operator !== undefined && node.infix !== undefined && !PURE_INFIX.has(node.operator)) {
    forest.infixCalls.add(node.infix);
  }
}

function plantTrees(
  forest: Forest,
  closes: Map<number, number>,
): Map<ExpressionRange, Tree | undefined> {
  const trees = new Map<ExpressionRange, Tree | undefined>();
  for (const range of expressionRanges(forest.tokens, closes)) {
    const root = rangeTree(forest.tokens, range.items);
    trees.set(range, root);
    forest.roots.push(...(root === undefined ? [] : [root]));
    for (const node of root === undefined ? [] : expressionNodes(root)) {
      markInfixCall(forest, node);
    }
    if (root !== undefined && range.group !== undefined) {
      forest.byGroup.set(range.group, root);
    }
  }
  return trees;
}

function compoundsOf(trees: Map<ExpressionRange, Tree | undefined>): CompoundPair[] {
  return [...trees].flatMap(([range, value]): CompoundPair[] => {
    const target = range.after === undefined ? undefined : trees.get(range.after.target);
    return range.after !== undefined && target !== undefined && value !== undefined
      ? [{ operator: range.after.operator, target, value }]
      : [];
  });
}

export function expressionForest(scanned: Scanned): Forest {
  const tokens = kotlinTokens(scanned);
  const closes = closingTokens(tokens);
  const forest: Forest = {
    tokens,
    roots: [],
    byGroup: new Map(),
    compounds: [],
    infixCalls: new Set(),
  };
  if (closes === undefined) {
    return forest;
  }
  forest.compounds = compoundsOf(plantTrees(forest, closes));
  linkGroups(forest);
  return forest;
}

export function unwrapped(forest: Forest, node: Tree): Tree {
  return chainFrom<Tree>(node, (current: Tree) => soleGroup(forest, current)).at(-1) ?? node;
}

function nodeTokens(forest: Forest, node: Tree): Token[] {
  return forest.tokens.slice(node.first, node.last + 1);
}

function spaced(tokens: Token[], joiner: (before: Token, token: Token) => boolean): string {
  return tokens
    .map((token, index) => {
      const before = tokens[index - 1];
      return before !== undefined && joiner(before, token) ? ` ${token.text}` : token.text;
    })
    .join('');
}

export function nodeText(forest: Forest, node: Tree): string {
  return spaced(
    nodeTokens(forest, unwrapped(forest, node)),
    (before: Token, token: Token) => before.end < token.start,
  );
}

function keyText(forest: Forest, node: Tree): string {
  return spaced(nodeTokens(forest, unwrapped(forest, node)), () => true);
}

export function nodeSize(forest: Forest, node: Tree): number {
  const inner = unwrapped(forest, node);
  return inner.last - inner.first;
}

export function nodeKey(forest: Forest, node: Tree): string {
  const inner = unwrapped(forest, node);
  if (
    inner.operator === undefined ||
    !(MIRRORED.has(inner.operator) || SYMMETRIC.has(inner.operator))
  ) {
    return keyText(forest, inner);
  }
  const sides = [keyText(forest, inner.left), keyText(forest, inner.right)];
  if (inner.operator === '>' || inner.operator === '>=') {
    return `${sides[1] ?? ''} ${MIRRORED.get(inner.operator) ?? ''} ${sides[0] ?? ''}`;
  }
  const ordered = SYMMETRIC.has(inner.operator)
    ? sides.toSorted((left, right) => left.localeCompare(right))
    : sides;
  return `${ordered[0] ?? ''} ${inner.operator} ${ordered[1] ?? ''}`;
}

function isCall(tokens: Token[], index: number): boolean {
  const text = tokens[index]?.text;
  if (text === '{') {
    return true;
  }
  const before = tokens[index - 1];
  const callee =
    before !== undefined &&
    (CALLERS.has(before.kind) || [')', ']', '>', '!!'].includes(before.text)) &&
    (before.text !== '>' || before.end === tokens[index]?.start) &&
    !OPERATOR_WORDS.has(before.text);
  return text === '(' && callee && !LITERAL_WORDS.has(before.text);
}

export function isEffectFree(forest: Forest, node: Tree): boolean {
  const inner = unwrapped(forest, node);
  return !nodeTokens(forest, inner).some(
    (token, offset) =>
      WRITES.has(token.text) ||
      token.literal?.template === true ||
      isCall(forest.tokens, inner.first + offset) ||
      forest.infixCalls.has(inner.first + offset),
  );
}

function namesBinding(tokens: Token[], index: number): boolean {
  const { kind = '', text = '' } = tokens[index] ?? {};
  const before = tokens[index - 1]?.text ?? '';
  return kind === 'word' && !LITERAL_WORDS.has(text) && !MEMBER_MARKS.has(before);
}

export function isStable(forest: Forest, node: Tree): boolean {
  const inner = unwrapped(forest, node);
  return (
    isEffectFree(forest, inner) &&
    nodeTokens(forest, inner).some((_, offset) => namesBinding(forest.tokens, inner.first + offset))
  );
}
