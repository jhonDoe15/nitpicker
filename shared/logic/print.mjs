import { foldTerm, isStatement } from './terms.mjs';

const BINARY_PRECEDENCE = new Map([
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

const LOGICAL_PRECEDENCE = new Map([
  ['??', 3],
  ['||', 3],
  ['&&', 4],
]);

const UNARY = 14;
const POSTFIX = 17;
const LEAF = 18;
const SIGNS = new Set(['-', '+']);
const WORD_OPERATORS = new Set(['typeof', 'void', 'delete']);

function precedence(node) {
  switch (node.kind) {
    case 'conditional': {
      return 1;
    }
    case 'logical': {
      return LOGICAL_PRECEDENCE.get(node.value);
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
      return node.loose === true ? 0 : UNARY;
    }
    default: {
      return LEAF;
    }
  }
}

function needsGroup(parent, child, minimum) {
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

function isIntegerReceiver(parent, index) {
  const child = parent.children[index];
  const postfix = parent.kind === 'member' || parent.kind === 'index';
  return (
    postfix && index === 0 && child.kind === 'literal' && INTEGER_TEXT.test(String(child.value))
  );
}

function grouped(parent, index, texts) {
  const minimum = operandPrecedence(parent, index);
  const group =
    needsGroup(parent, parent.children[index], minimum) || isIntegerReceiver(parent, index);
  return group ? `(${texts[index]})` : texts[index];
}

function operandPrecedence(parent, index) {
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

function printUnary(node, texts) {
  const inner = grouped(node, 0, texts);
  if (WORD_OPERATORS.has(node.value)) {
    return `${node.value} ${inner}`;
  }
  const doubled = SIGNS.has(node.value) && inner.startsWith(node.value);
  return doubled ? `${node.value}(${inner})` : `${node.value}${inner}`;
}

function printExpression(node, texts) {
  switch (node.kind) {
    case 'binary':
    case 'logical': {
      return `${grouped(node, 0, texts)} ${node.value} ${grouped(node, 1, texts)}`;
    }
    case 'unary': {
      return printUnary(node, texts);
    }
    case 'conditional': {
      return `${grouped(node, 0, texts)} ? ${grouped(node, 1, texts)} : ${grouped(node, 2, texts)}`;
    }
    case 'member': {
      return `${grouped(node, 0, texts)}.${node.value}`;
    }
    case 'index': {
      return `${grouped(node, 0, texts)}[${texts[1]}]`;
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

function printStatement(node, texts) {
  switch (node.kind) {
    case 'block': {
      return texts.length === 0 ? '{}' : `{ ${texts.join(' ')} }`;
    }
    case 'if': {
      const head = `if (${texts[0]}) ${texts[1]}`;
      return texts[2] === undefined ? head : `${head} else ${texts[2]}`;
    }
    case 'return':
    case 'throw': {
      return texts.length === 0 ? `${node.kind};` : `${node.kind} ${texts[0]};`;
    }
    case 'break':
    case 'continue': {
      return node.value === undefined ? `${node.kind};` : `${node.kind} ${node.value};`;
    }
    case 'expression': {
      return `${texts[0]};`;
    }
    default: {
      return String(node.value);
    }
  }
}

export function print(root) {
  return foldTerm(root, (node, texts) =>
    isStatement(node) ? printStatement(node, texts) : printExpression(node, texts),
  );
}
