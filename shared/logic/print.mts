import { foldTerm, isStatement } from './terms.mts';
import type { Term } from './typed/term-types.mts';

const BINARY_PRECEDENCE = new Map<string | undefined, number>([
  ['|', 5],
  ['^', 6],
  ['&', 7],
  ['==', 8],
  ['!=', 8],
  ['===', 8],
  ['!==', 8],
  ['<', 9],
  ['<=', 9],
  ['>', 9],
  ['>=', 9],
  ['instanceof', 9],
  ['in', 9],
  ['<<', 10],
  ['>>', 10],
  ['>>>', 10],
  ['+', 11],
  ['-', 11],
  ['*', 12],
  ['**', 13],
  ['/', 12],
  ['%', 12],
]);

const LOGICAL_PRECEDENCE = new Map<string | undefined, number>([
  ['??', 3],
  ['||', 3],
  ['&&', 4],
]);

const UNARY = 14;
const POSTFIX = 17;
const LEAF = 18;
const ASSIGNMENT = 1;
const SIGNS = new Set<string | undefined>(['-', '+']);
const WORD_OPERATORS = new Set<string | undefined>(['typeof', 'void', 'delete']);

function looseness(node: Term): number {
  if (node.loose !== true) {
    return UNARY;
  }
  return node.assignment === true ? ASSIGNMENT : 0;
}

function precedence(node: Term): number {
  switch (node.kind) {
    case 'conditional': {
      return 1;
    }
    case 'logical': {
      return LOGICAL_PRECEDENCE.get(node.value) ?? Number.NaN;
    }
    case 'binary': {
      return BINARY_PRECEDENCE.get(node.value) ?? 0;
    }
    case 'unary': {
      return UNARY;
    }
    case 'member':
    case 'index':
    case 'call': {
      return POSTFIX;
    }
    case 'opaque': {
      return looseness(node);
    }
    default: {
      return LEAF;
    }
  }
}

function needsGroup(parent: Term, child: Term, minimum: number): boolean {
  const mixesNullish =
    parent.kind === 'logical' &&
    child.kind === 'logical' &&
    parent.value !== child.value &&
    (parent.value === '??' || child.value === '??');
  return mixesNullish || precedence(child) < minimum;
}

const INTEGER_TEXT = /^\d+$/u;
const POWER = 13;
const ARGUMENT = 1;

function isIntegerReceiver(parent: Term, index: number): boolean {
  const child = parent.children[index];
  const postfix = parent.kind === 'member' || parent.kind === 'index';
  return (
    postfix && index === 0 && child?.kind === 'literal' && INTEGER_TEXT.test(String(child.value))
  );
}

function grouped(parent: Term, index: number, texts: readonly string[]): string {
  const minimum = operandPrecedence(parent, index);
  const child = parent.children[index];
  const group =
    child !== undefined && (needsGroup(parent, child, minimum) || isIntegerReceiver(parent, index));
  const text = String(texts[index]);
  return group ? `(${text})` : text;
}

function operandPrecedence(parent: Term, index: number): number {
  if (parent.kind === 'conditional') {
    return index === 0 ? 2 : 1;
  }
  if (parent.kind === 'binary' && parent.value === '**') {
    return index === 0 ? UNARY + 1 : POWER;
  }
  if (parent.kind === 'binary' || parent.kind === 'logical') {
    return precedence(parent) + index;
  }
  if (parent.kind === 'call' && index > 0) {
    return ARGUMENT;
  }
  return parent.kind === 'unary' ? UNARY : POSTFIX;
}

function printUnary(node: Term, texts: readonly string[]): string {
  const inner = grouped(node, 0, texts);
  const operator = String(node.value);
  if (WORD_OPERATORS.has(node.value)) {
    return `${operator} ${inner}`;
  }
  const doubled = SIGNS.has(node.value) && inner.startsWith(operator);
  return doubled ? `${operator}(${inner})` : `${operator}${inner}`;
}

function printExpression(node: Term, texts: readonly string[]): string {
  switch (node.kind) {
    case 'binary':
    case 'logical': {
      return `${grouped(node, 0, texts)} ${String(node.value)} ${grouped(node, 1, texts)}`;
    }
    case 'unary': {
      return printUnary(node, texts);
    }
    case 'conditional': {
      return `${grouped(node, 0, texts)} ? ${grouped(node, 1, texts)} : ${grouped(node, 2, texts)}`;
    }
    case 'member': {
      return `${grouped(node, 0, texts)}.${String(node.value)}`;
    }
    case 'index': {
      return `${grouped(node, 0, texts)}[${String(texts[1])}]`;
    }
    case 'call': {
      const args = texts.slice(1).map((_text, index) => grouped(node, index + 1, texts));
      return `${grouped(node, 0, texts)}(${args.join(', ')})`;
    }
    case 'this': {
      return 'this';
    }
    default: {
      return String(node.value);
    }
  }
}

function printStatement(node: Term, texts: readonly string[]): string {
  switch (node.kind) {
    case 'block': {
      return texts.length === 0 ? '{}' : `{ ${texts.join(' ')} }`;
    }
    case 'if': {
      const head = `if (${String(texts[0])}) ${String(texts[1])}`;
      return texts[2] === undefined ? head : `${head} else ${texts[2]}`;
    }
    case 'return':
    case 'throw': {
      return texts.length === 0 ? `${node.kind};` : `${node.kind} ${String(texts[0])};`;
    }
    case 'break':
    case 'continue': {
      return node.value === undefined ? `${node.kind};` : `${node.kind} ${node.value};`;
    }
    case 'expression': {
      return `${String(texts[0])};`;
    }
    default: {
      return String(node.value);
    }
  }
}

export function printWith(root: Term, textOf: (node: Term) => string | undefined): string {
  return foldTerm<string>(
    root,
    (node, texts) =>
      textOf(node) ??
      (isStatement(node) ? printStatement(node, texts) : printExpression(node, texts)),
  );
}

export function print(root: Term): string {
  return printWith(root, () => undefined);
}
