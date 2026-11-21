import { modelOf } from '../../logic/models/models.mts';
import { print } from '../../logic/print.mts';
import { term } from '../../logic/terms.mts';
import { isOneOf, present, rebuild } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import { goIntegerNames } from './integer-types.mts';

export type TermContext = {
  readonly locals: { readonly get: (name: string) => Term | undefined };
  readonly parameters: ReadonlyMap<string, Term>;
  readonly strictEquality: boolean;
  readonly looseBooleans: boolean;
  readonly exactIntegers: boolean;
  readonly isOpaque?: (node: TreeNode) => boolean;
};

type Converter = (node: TreeNode, children: Term[], context: TermContext) => Term | undefined;

const UNARY = 'unary';
const IS_NOT = 'is not';

const LITERAL_KIND = 'literal';
const BINARY_KIND = 'binary';

const INTEGER_TYPES = new Set([
  'int',
  'long',
  'short',
  'byte',
  'Int',
  'Long',
  'Short',
  'Byte',
  ...goIntegerNames(),
]);
const LOGICAL = new Set(['&&', '||']);
const EQUALITY = new Map([
  ['==', '==='],
  ['!=', '!=='],
  ['is', '==='],
  [IS_NOT, '!=='],
]);
const EXTREMES = new Map([
  ['min', '<='],
  ['max', '>='],
  ['minOf', '<='],
  ['maxOf', '>='],
]);
const MATH_OWNERS = new Set(['Math', 'StrictMath']);
const RADIX_FORMS: readonly (readonly [RegExp, string])[] = [
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
  [IS_NOT, 'is'],
]);
const SYMMETRIC = new Set(['==', '===', 'is']);
const SINGLETONS = new Set(['null']);
const COMPARES = new Set(['==', '!=', '===', '!==', 'is', IS_NOT, '<', '<=', '>', '>=']);

export function isIntegerType(type: TreeNode | undefined): boolean {
  return type?.kind === 'type' && isOneOf(INTEGER_TYPES, type.value);
}

function integerValue(text: string): number | undefined {
  const [form, prefix] = RADIX_FORMS.find(([pattern]) => pattern.test(text)) ?? [];
  if (form === undefined) {
    return undefined;
  }
  const value = BigInt(`${String(prefix)}${present(form.exec(text)?.groups?.['digits'])}`);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.NaN;
}

function numberValue(text: string): number {
  const value = integerValue(text) ?? Number(text.replace(FLOAT_SUFFIX, ''));
  return SINGLE_FLOAT.test(text) && Math.fround(value) !== value ? Number.NaN : value;
}

function literalTerm(node: TreeNode): Term | undefined {
  if (node.bits !== undefined) {
    return term(LITERAL_KIND, node.value);
  }
  if (node.literal === 'number') {
    const value = numberValue(present(node.value));
    return Number.isFinite(value) ? term(LITERAL_KIND, String(value)) : undefined;
  }
  if (node.literal === 'boolean' || node.literal === 'null') {
    return term(LITERAL_KIND, node.value);
  }
  return term(LITERAL_KIND, JSON.stringify(`${node.literal ?? ''}:${String(node.value)}`));
}

function nameTerm(node: TreeNode, context: TermContext): Term | undefined {
  if (node.binding === 'free') {
    return term('name', `free:${String(node.value)}`);
  }
  if (node.value === undefined) {
    return undefined;
  }
  return context.locals.get(node.value) ?? context.parameters.get(node.value);
}

function extremeName(callee: TreeNode): string | undefined {
  if (callee.kind === 'name' && callee.binding === 'free') {
    return callee.text ?? callee.value;
  }
  const owner = callee.kind === 'member' ? callee.children[0] : undefined;
  return owner?.kind === 'name' && MATH_OWNERS.has(owner.text ?? owner.value ?? '')
    ? callee.value
    : undefined;
}

function extremeOf(node: TreeNode, [, ...operands]: readonly Term[]): Term | undefined {
  const name = extremeName(present(node.children[0]));
  const relation = name === undefined ? undefined : EXTREMES.get(name);
  const [left, right] = operands;
  if (relation === undefined || operands.length !== 2 || !left || !right) {
    return undefined;
  }
  return term('conditional', undefined, [term(BINARY_KIND, relation, [left, right]), left, right]);
}

function isArithmetic(value: string | undefined, children: readonly Term[]): boolean {
  return isOneOf(ARITHMETIC, value) && children.some((child) => child.kind !== LITERAL_KIND);
}

function isIntegral(child: Term): boolean {
  return (
    child.integer === true ||
    modelOf(child)?.integer === true ||
    (child.kind === LITERAL_KIND && INTEGER_TEXT.test(child.value ?? ''))
  );
}

function valueAtom(built: Term, context: TermContext): Term {
  const integral = built.children.every((child) => isIntegral(child));
  if (integral && context.exactIntegers && isOneOf(EXACT, built.value)) {
    return built;
  }
  const atom = term('name', `#value ${print(built)}`);
  return integral ? { ...atom, integer: true } : atom;
}

function charCode(operand: Term, source: TreeNode | undefined): Term {
  const char =
    source?.literal === 'char' ? PLAIN_CHAR.exec(source.value ?? '')?.groups?.['char'] : undefined;
  return char === undefined ? operand : term(LITERAL_KIND, String(char.codePointAt(0)));
}

function isLooseBoolean(node: TreeNode, context: TermContext): boolean {
  return (
    context.looseBooleans &&
    isOneOf(LOOSE_EQUALITY, node.value) &&
    node.children.some((child) => child.literal === 'boolean')
  );
}

function isIdentityTest(node: TreeNode): boolean {
  return (
    (node.value === 'is' || node.value === IS_NOT) &&
    !node.children.some((child) => isOneOf(SINGLETONS, child.literal))
  );
}

function isOpaque(node: TreeNode, context: TermContext): boolean {
  return (
    isOneOf(COMPARES, node.value) && (isIdentityTest(node) || context.isOpaque?.(node) === true)
  );
}

function printedOperand(operand: Term, source: TreeNode | undefined): string {
  return source?.kind === LITERAL_KIND
    ? `${String(source.literal)}:${String(source.value)}`
    : print(operand);
}

function opaqueTerm(node: TreeNode, operands: readonly Term[]): Term {
  const positive = node.value === undefined ? undefined : POSITIVE.get(node.value);
  const relation = positive ?? node.value ?? '';
  const printed = operands.map((operand, index) => printedOperand(operand, node.children[index]));
  const sides = SYMMETRIC.has(relation) ? printed.toSorted() : printed;
  const atom = term('name', `#opaque ${relation} ${sides.join(' ')}`);
  return positive === undefined ? atom : term(UNARY, '!', [atom]);
}

function binaryTerm(node: TreeNode, operands: Term[], context: TermContext): Term | undefined {
  if (isOneOf(LOGICAL, node.value)) {
    return term('logical', node.value, operands);
  }
  if (isLooseBoolean(node, context)) {
    return undefined;
  }
  const [left, right] = isOneOf(COMPARISONS, node.value)
    ? operands.map((operand, index) => charCode(operand, node.children[index]))
    : operands;
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (node.bits !== undefined) {
    return term(BINARY_KIND, node.value, [left, right]);
  }
  if (isOpaque(node, context)) {
    return opaqueTerm(node, [left, right]);
  }
  if (isArithmetic(node.value, [left, right])) {
    return valueAtom(term(BINARY_KIND, node.value, [left, right]), context);
  }
  const strict =
    context.strictEquality && node.value !== undefined ? EQUALITY.get(node.value) : undefined;
  return term(BINARY_KIND, strict ?? node.value, [left, right]);
}

const TERMS: Readonly<Record<string, Converter>> = {
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
      return term(UNARY, node.value, children);
    }
    if (node.value === '-' && isArithmetic(node.value, children)) {
      return valueAtom(term(UNARY, '-', children), context);
    }
    return node.value === '!' || node.value === '-' ? term(UNARY, node.value, children) : undefined;
  },
  binary: (node, children, context) => binaryTerm(node, children, context),
  conditional: (_node, children) => term('conditional', undefined, children),
};

function operationOf(node: TreeNode, children: readonly Term[]): Term | undefined {
  if (node.operation === 'abs') {
    return term('abs', undefined, [present(children[1])]);
  }
  return node.operation === 'cast'
    ? term('cast', node.value, [present(present(children[0]).children[0])])
    : undefined;
}

function allBuilt(children: readonly (Term | undefined)[]): children is Term[] {
  return children.every((child) => child !== undefined);
}

function termOf(
  node: TreeNode,
  children: (Term | undefined)[],
  context: TermContext,
): Term | undefined {
  const convert = Object.hasOwn(TERMS, node.kind) ? TERMS[node.kind] : undefined;
  if (convert === undefined || !allBuilt(children)) {
    return undefined;
  }
  const built = convert(node, children, context);
  if (built === undefined) {
    return built;
  }
  const result: Term = {
    ...built,
    ...(node.model === undefined ? {} : { model: node.model }),
    ...(node.helper === undefined ? {} : { helper: node.helper }),
    ...(node.bits === undefined ? {} : { bits: node.bits }),
    ...(node.signed === undefined ? {} : { signed: node.signed }),
  };
  return node.unstable === true ? term('call', undefined, [result]) : result;
}

export function logicTerm(root: TreeNode, context: TermContext): Term | undefined {
  return rebuild(root, (node: TreeNode, children: (Term | undefined)[]) =>
    termOf(node, children, context),
  );
}
