import { chainOf, depthFirst } from '../../../../../../shared/traversal.mjs';
import { expressionRanges } from './expression-ranges.mjs';
import { rangeTree } from './expression-trees.mjs';
import { closingTokens, kotlinTokens } from './kotlin-tokens.mjs';

const MIRRORED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);
const SYMMETRIC = new Set(['==', '!=', '===', '!==']);
const WRITES = new Set(['++', '--', '=', '+=', '-=', '*=', '/=', '%=']);
const CALLERS = new Set(['word', 'string', 'char', 'number']);
const LITERAL_WORDS = new Set(['true', 'false', 'null']);
const MEMBER_MARKS = new Set(['.', '?.', '::']);

/** Every node of an expression tree, the root first. */
export function expressionNodes(root) {
  return depthFirst(root, (node) => (node.operator === undefined ? [] : [node.left, node.right]));
}

function soleGroup(forest, node) {
  if (node.operator !== undefined) {
    return undefined;
  }
  const [item] = node.items;
  const isGroup = node.items.length === 1 && item.close !== undefined;
  return isGroup && forest.tokens[item.token].text === '('
    ? forest.byGroup.get(item.token)
    : undefined;
}

function linkGroups(forest) {
  const leaves = forest.roots.flatMap((root) => [...expressionNodes(root)]);
  for (const leaf of leaves) {
    const inner = soleGroup(forest, leaf);
    if (inner !== undefined) {
      inner.parent = leaf.parent;
    }
  }
}

function plantTrees(forest, closes) {
  const trees = new Map();
  for (const range of expressionRanges(forest.tokens, closes)) {
    const root = rangeTree(forest.tokens, range.items);
    trees.set(range, root);
    forest.roots.push(...(root === undefined ? [] : [root]));
    if (root !== undefined && range.group !== undefined) {
      forest.byGroup.set(range.group, root);
    }
  }
  return trees;
}

function compoundsOf(trees) {
  return [...trees].flatMap(([range, value]) => {
    const target = range.after === undefined ? undefined : trees.get(range.after.target);
    const isPair = target !== undefined && value !== undefined;
    return isPair ? [{ operator: range.after.operator, target, value }] : [];
  });
}

/**
 * Every expression tree of a scanned Kotlin file, with the compound assignments; empty when the
 * brackets do not pair up.
 */
export function expressionForest(scanned) {
  const tokens = kotlinTokens(scanned);
  const closes = closingTokens(tokens);
  const forest = { tokens, roots: [], byGroup: new Map(), compounds: [] };
  if (closes === undefined) {
    return forest;
  }
  forest.compounds = compoundsOf(plantTrees(forest, closes));
  linkGroups(forest);
  return forest;
}

/** The node itself, or the expression inside the parentheses that make up all of it. */
export function unwrapped(forest, node) {
  return chainOf(node, (current) => soleGroup(forest, current)).at(-1);
}

function nodeTokens(forest, node) {
  return forest.tokens.slice(node.first, node.last + 1);
}

function spaced(tokens, joiner) {
  return tokens
    .map((token, index) =>
      index > 0 && joiner(tokens[index - 1], token) ? ` ${token.text}` : token.text,
    )
    .join('');
}

/** The node as written, with each run of whitespace or comments printed as one space. */
export function nodeText(forest, node) {
  return spaced(
    nodeTokens(forest, unwrapped(forest, node)),
    (before, token) => before.end < token.start,
  );
}

function keyText(forest, node) {
  return spaced(nodeTokens(forest, unwrapped(forest, node)), () => true);
}

/** The text two operands share when they are the same value: comparisons read from one side. */
export function nodeKey(forest, node) {
  const inner = unwrapped(forest, node);
  if (!MIRRORED.has(inner.operator) && !SYMMETRIC.has(inner.operator)) {
    return keyText(forest, inner);
  }
  const sides = [keyText(forest, inner.left), keyText(forest, inner.right)];
  if (inner.operator === '>' || inner.operator === '>=') {
    return `${sides[1]} ${MIRRORED.get(inner.operator)} ${sides[0]}`;
  }
  const ordered = SYMMETRIC.has(inner.operator)
    ? sides.toSorted((left, right) => left.localeCompare(right))
    : sides;
  return `${ordered[0]} ${inner.operator} ${ordered[1]}`;
}

function isCall(tokens, index) {
  const { text } = tokens[index];
  if (text === '{') {
    return true;
  }
  const before = tokens[index - 1];
  const callee =
    before !== undefined &&
    (CALLERS.has(before.kind) || [')', ']', '>', '!!'].includes(before.text));
  return text === '(' && callee && !LITERAL_WORDS.has(before.text);
}

/** True when evaluating the node twice gives the same value: no writes, calls, lambdas or string templates. */
export function isEffectFree(forest, node) {
  const inner = unwrapped(forest, node);
  return !nodeTokens(forest, inner).some(
    (token, offset) =>
      WRITES.has(token.text) ||
      token.literal?.template === true ||
      isCall(forest.tokens, inner.first + offset),
  );
}

function namesBinding(tokens, index) {
  const { kind, text } = tokens[index];
  const before = tokens[index - 1]?.text;
  return kind === 'word' && !LITERAL_WORDS.has(text) && !MEMBER_MARKS.has(before);
}

/** True when the node is effect-free and reads a name, so two copies of it are one value. */
export function isStable(forest, node) {
  const inner = unwrapped(forest, node);
  return (
    isEffectFree(forest, inner) &&
    nodeTokens(forest, inner).some((_, offset) => namesBinding(forest.tokens, inner.first + offset))
  );
}
