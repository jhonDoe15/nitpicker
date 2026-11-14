import { print } from '../../logic/print.mjs';
import { term } from '../../logic/terms.mjs';
import { rebuild } from '../tree/nodes.mjs';

const LITERAL_KIND = 'literal';
const BINARY_KIND = 'binary';

const INTEGER_TYPES = new Set(['int', 'long', 'short', 'byte', 'Int', 'Long', 'Short', 'Byte']);
const LOGICAL = new Set(['&&', '||']);
const EQUALITY = new Map([
  ['==', '==='],
  ['!=', '!=='],
  ['is', '==='],
  ['is not', '!=='],
]);
const EXTREMES = new Map([
  ['min', '<='],
  ['max', '>='],
  ['minOf', '<='],
  ['maxOf', '>='],
]);
const MATH_OWNERS = new Set(['Math', 'StrictMath']);
const RADIX_FORMS = [
  [/^0x(?<digits>[\da-f]+)l?$/u, '0x'],
  [/^0b(?<digits>[01]+)l?$/u, '0b'],
  [/^0o?(?<digits>[0-7]+)l?$/u, '0o'],
  [/^(?<digits>\d+)l?$/u, ''],
];
const FLOAT_SUFFIX = /[fd]$/u;
const SINGLE_FLOAT = /f$/u;
const PLAIN_CHAR = /^'(?<char>[^\\'])'$/u;
const INTEGER_TEXT = /^-?\d+$/u;
const ARITHMETIC = new Set(['+', '-', '*', '/', '%']);
const COMPARISONS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const LOOSE_EQUALITY = new Set(['==', '!=']);

export function isIntegerType(type) {
  return type?.kind === 'type' && INTEGER_TYPES.has(type.value);
}

function integerValue(text) {
  const [form, prefix] = RADIX_FORMS.find(([pattern]) => pattern.test(text)) ?? [];
  if (form === undefined) {
    return undefined;
  }
  const value = BigInt(`${prefix}${form.exec(text).groups.digits}`);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.NaN;
}

function numberValue(text) {
  const value = integerValue(text) ?? Number(text.replace(FLOAT_SUFFIX, ''));
  return SINGLE_FLOAT.test(text) && Math.fround(value) !== value ? Number.NaN : value;
}

function literalTerm(node) {
  if (node.literal === 'number') {
    const value = numberValue(node.value);
    return Number.isFinite(value) ? term(LITERAL_KIND, String(value)) : undefined;
  }
  if (node.literal === 'boolean' || node.literal === 'null') {
    return term(LITERAL_KIND, node.value);
  }
  return term(LITERAL_KIND, JSON.stringify(`${node.literal ?? ''}:${node.value}`));
}

function nameTerm(node, context) {
  if (node.binding === 'free') {
    return term('name', `free:${node.value}`);
  }
  return context.locals.get(node.value) ?? context.parameters.get(node.value);
}

function extremeName(callee) {
  if (callee.kind === 'name' && callee.binding === 'free') {
    return callee.text ?? callee.value;
  }
  const owner = callee.kind === 'member' ? callee.children[0] : undefined;
  return owner?.kind === 'name' && MATH_OWNERS.has(owner.text ?? owner.value)
    ? callee.value
    : undefined;
}

function extremeOf(node, [, ...operands]) {
  const relation = EXTREMES.get(extremeName(node.children[0]));
  if (relation === undefined || operands.length !== 2) {
    return undefined;
  }
  const [left, right] = operands;
  return term('conditional', undefined, [term(BINARY_KIND, relation, [left, right]), left, right]);
}

function isArithmetic(value, children) {
  return ARITHMETIC.has(value) && children.some((child) => child.kind !== LITERAL_KIND);
}

function valueAtom(built) {
  const atom = term('name', `#value ${print(built)}`);
  const integral = built.children.every(
    (child) =>
      child.integer === true || (child.kind === LITERAL_KIND && INTEGER_TEXT.test(child.value)),
  );
  return integral ? { ...atom, integer: true } : atom;
}

function charCode(operand, source) {
  const char = source.literal === 'char' ? PLAIN_CHAR.exec(source.value)?.groups.char : undefined;
  return char === undefined ? operand : term(LITERAL_KIND, String(char.codePointAt(0)));
}

function isLooseBoolean(node, context) {
  return (
    context.looseBooleans === true &&
    LOOSE_EQUALITY.has(node.value) &&
    node.children.some((child) => child.literal === 'boolean')
  );
}

function binaryTerm(node, operands, context) {
  if (LOGICAL.has(node.value)) {
    return term('logical', node.value, operands);
  }
  if (isLooseBoolean(node, context)) {
    return undefined;
  }
  const [left, right] = COMPARISONS.has(node.value)
    ? operands.map((operand, index) => charCode(operand, node.children[index]))
    : operands;
  if (isArithmetic(node.value, [left, right])) {
    return valueAtom(term(BINARY_KIND, node.value, [left, right]));
  }
  const strict = context.strictEquality ? EQUALITY.get(node.value) : undefined;
  return term(BINARY_KIND, strict ?? node.value, [left, right]);
}

const TERMS = {
  literal: (node) => literalTerm(node),
  name: (node, _children, context) => nameTerm(node, context),
  this: () => term('this'),
  member: (node, children) => term('member', node.value, children),
  index: (_node, children) => term('index', undefined, children),
  call: (node, children) => extremeOf(node, children) ?? term('call', undefined, children),
  unary: (node, children) => {
    if (node.value === '-' && isArithmetic(node.value, children)) {
      return valueAtom(term('unary', '-', children));
    }
    return node.value === '!' || node.value === '-'
      ? term('unary', node.value, children)
      : undefined;
  },
  binary: (node, children, context) => binaryTerm(node, children, context),
  conditional: (_node, children) => term('conditional', undefined, children),
};

function termOf(node, children, context) {
  const convert = Object.hasOwn(TERMS, node.kind) ? TERMS[node.kind] : undefined;
  if (convert === undefined || children.some((child) => child === undefined)) {
    return undefined;
  }
  return convert(node, children, context);
}

export function logicTerm(root, context) {
  return rebuild(root, (node, children) => termOf(node, children, context));
}
