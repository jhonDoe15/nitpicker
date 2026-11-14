import { modelOf } from '../../logic/models/models.mjs';
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
const EXACT = new Set(['+', '-', '*']);
const COMPARISONS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const LOOSE_EQUALITY = new Set(['==', '!=']);
const POSITIVE = new Map([
  ['!=', '=='],
  ['!==', '==='],
  ['is not', 'is'],
]);
const SYMMETRIC = new Set(['==', '===', 'is']);
const SINGLETONS = new Set(['null']);
const COMPARES = new Set(['==', '!=', '===', '!==', 'is', 'is not', '<', '<=', '>', '>=']);

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
  if (node.bits !== undefined) {
    return term(LITERAL_KIND, node.value);
  }
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

function isIntegral(child) {
  return (
    child.integer === true ||
    modelOf(child)?.integer === true ||
    (child.kind === LITERAL_KIND && INTEGER_TEXT.test(child.value))
  );
}

function valueAtom(built, context) {
  const integral = built.children.every((child) => isIntegral(child));
  if (integral && context.exactIntegers === true && EXACT.has(built.value)) {
    return built;
  }
  const atom = term('name', `#value ${print(built)}`);
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

function isIdentityTest(node) {
  return (
    (node.value === 'is' || node.value === 'is not') &&
    !node.children.some((child) => SINGLETONS.has(child.literal))
  );
}

function isOpaque(node, context) {
  return COMPARES.has(node.value) && (isIdentityTest(node) || context.isOpaque?.(node) === true);
}

function printedOperand(operand, source) {
  return source.kind === LITERAL_KIND ? `${source.literal}:${source.value}` : print(operand);
}

function opaqueTerm(node, operands) {
  const relation = POSITIVE.get(node.value) ?? node.value;
  const printed = operands.map((operand, index) => printedOperand(operand, node.children[index]));
  const sides = SYMMETRIC.has(relation) ? printed.toSorted() : printed;
  const atom = term('name', `#opaque ${relation} ${sides.join(' ')}`);
  return POSITIVE.has(node.value) ? term('unary', '!', [atom]) : atom;
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
  if (node.bits !== undefined) {
    return term(BINARY_KIND, node.value, [left, right]);
  }
  if (isOpaque(node, context)) {
    return opaqueTerm(node, [left, right]);
  }
  if (isArithmetic(node.value, [left, right])) {
    return valueAtom(term(BINARY_KIND, node.value, [left, right]), context);
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
  call: (node, children) =>
    operationOf(node, children) ?? extremeOf(node, children) ?? term('call', undefined, children),
  expression: (node, children) =>
    node.operation === 'cast' ? term('cast', node.value, children) : undefined,
  unary: (node, children, context) => {
    if (node.bits !== undefined) {
      return term('unary', node.value, children);
    }
    if (node.value === '-' && isArithmetic(node.value, children)) {
      return valueAtom(term('unary', '-', children), context);
    }
    return node.value === '!' || node.value === '-'
      ? term('unary', node.value, children)
      : undefined;
  },
  binary: (node, children, context) => binaryTerm(node, children, context),
  conditional: (_node, children) => term('conditional', undefined, children),
};

function pick(node, field) {
  return node[field] === undefined ? {} : { [field]: node[field] };
}

function operationOf(node, children) {
  if (node.operation === 'abs') {
    return term('abs', undefined, [children[1]]);
  }
  return node.operation === 'cast'
    ? term('cast', node.value, [children[0].children[0]])
    : undefined;
}

function termOf(node, children, context) {
  const convert = Object.hasOwn(TERMS, node.kind) ? TERMS[node.kind] : undefined;
  if (convert === undefined || children.some((child) => child === undefined)) {
    return undefined;
  }
  const built = convert(node, children, context);
  if (built === undefined) {
    return built;
  }
  const fields = ['model', 'helper', 'bits', 'signed'].map((field) => pick(node, field));
  const result = Object.assign({}, built, ...fields);
  return node.unstable === true ? term('call', undefined, [result]) : result;
}

export function logicTerm(root, context) {
  return rebuild(root, (node, children) => termOf(node, children, context));
}
