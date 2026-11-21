import type { TreeNode } from '../../../near-duplicates/tree/tree-types.mts';

export type Operator = 'and' | 'or';

const WORDS: Readonly<Record<Operator | 'not', string>> = { and: 'and', or: 'or', not: 'not ' };
const SYMBOLS: Readonly<Record<Operator | 'not', string>> = { and: '&&', or: '||', not: '!' };
const SIMPLE = new Set(['name', 'literal', 'this', 'member', 'index', 'call']);
const STRENGTH = new Map<string | undefined, Operator>([
  ['||', 'or'],
  ['or', 'or'],
  ['&&', 'and'],
  ['and', 'and'],
]);
const NEGATIONS = new Set<string | undefined>(['!', 'not']);

function isSimple(node: TreeNode): boolean {
  return SIMPLE.has(node.kind) || (node.kind === 'unary' && NEGATIONS.has(node.value));
}

function isTight(node: TreeNode, operator: Operator): boolean {
  if (isSimple(node)) {
    return true;
  }
  if (node.kind !== 'binary') {
    return false;
  }
  const own = STRENGTH.get(node.value);
  if (own === undefined) {
    return node.value !== '??';
  }
  return own === operator || own === 'and';
}

function grouped(node: TreeNode, operator: Operator): string {
  return isTight(node, operator) ? (node.text ?? '') : `(${node.text ?? ''})`;
}

function spelling(file: string): Readonly<Record<Operator | 'not', string>> {
  return file.endsWith('.py') ? WORDS : SYMBOLS;
}

export function joined(nodes: readonly TreeNode[], operator: Operator, file: string): string {
  const words = spelling(file);
  return nodes.map((node) => grouped(node, operator)).join(` ${words[operator]} `);
}

export function negated(node: TreeNode, file: string): string {
  const operand = node.children[0]?.text;
  if (node.kind === 'unary' && NEGATIONS.has(node.value) && operand !== undefined) {
    return operand;
  }
  const text = isSimple(node) && node.kind !== 'unary' ? (node.text ?? '') : `(${node.text ?? ''})`;
  return `${spelling(file).not}${text}`;
}

export function ifHead(text: string, file: string): string {
  if (file.endsWith('.py')) {
    return `if ${text}:`;
  }
  return file.endsWith('.go') ? `if ${text}` : `if (${text})`;
}
