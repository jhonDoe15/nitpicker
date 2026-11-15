import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  normalize as untypedNormalize,
  sameCondition,
} from '../../../../../../../shared/logic/normalize.mjs';
import { print as untypedPrint } from '../../../../../../../shared/logic/print.mjs';
import { toTerm as untypedToTerm } from './estree-terms.mjs';

type Statement = { type: string; expression?: unknown; body?: unknown };
type Program = { type: 'Program'; body: Statement[] };
type Term = { children: Term[]; integer?: boolean };
type SourceText = (node: { range: number[] }) => string;
type TermNode = { type: string; name?: string };
type TermOptions = {
  isBoolean?: (node: TermNode) => boolean;
  isInteger?: (node: TermNode) => boolean;
};

function isTerm(value: unknown): value is Term {
  return typeof value === 'object' && value !== null && 'children' in value;
}

function toTerm(root: unknown, sourceCode: { getText: SourceText }, options: TermOptions): Term {
  const term: unknown = Reflect.apply(untypedToTerm, undefined, [root, sourceCode, options]);
  if (isTerm(term)) {
    return term;
  }
  throw new TypeError('The conversion did not return a term.');
}

function isProgram(value: unknown): value is Program {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'Program' &&
    'body' in value &&
    Array.isArray(value.body)
  );
}

function programOf(code: string): Program {
  const result: unknown = tseslint.parser.parseForESLint(code);
  if (typeof result === 'object' && result !== null && 'ast' in result && isProgram(result.ast)) {
    return result.ast;
  }
  throw new TypeError('The parser did not return a program.');
}

function parsed(code: string, options: TermOptions = {}) {
  const ast = programOf(code);
  const sourceCode = {
    getText: (node: { range: number[] }) => code.slice(node.range[0], node.range[1]),
  };
  return { ast, convert: (node: unknown): Term => toTerm(node, sourceCode, options) };
}

function expressionTerm(code: string, options?: TermOptions): Term {
  const { ast, convert } = parsed(`(${code});`, options);
  const statement = ast.body.at(0);
  if (statement?.type !== 'ExpressionStatement') {
    throw new TypeError('Expected an expression statement.');
  }
  return convert(statement.expression);
}

function bodyTerm(code: string): Term {
  const { ast, convert } = parsed(`function f() { ${code} }`);
  const statement = ast.body.at(0);
  if (statement?.type !== 'FunctionDeclaration') {
    throw new TypeError('Expected a function declaration.');
  }
  return convert(statement.body);
}

const normalize: (
  node: Term,
  options?: { booleanContext?: boolean },
) => { term: Term; rewrites: { rewrite: string }[] } = untypedNormalize;

const print: (root: Term) => string = untypedPrint;

function simplified(term: Term, options?: { booleanContext?: boolean }) {
  const { term: normal, rewrites } = normalize(term, options);
  return { form: print(normal), rewrites: rewrites.map(({ rewrite }) => rewrite) };
}

const inCondition = { booleanContext: true };

describe('TypeScript terms in normal form', () => {
  it.each([
    ['double-negation', '!!ready', inCondition, 'ready'],
    ['double-negation', '!!(a < b)', {}, 'a < b'],
    ['de-morgan', '!(a && b)', {}, '!a || !b'],
    ['de-morgan', '!(a || load())', {}, '!a && !load()'],
    ['flipped-equality', '!(a === b)', {}, 'a !== b'],
    ['negated-boolean-literal', '!true', {}, 'false'],
    ['constant-boolean-operand', 'ready && true', inCondition, 'ready'],
    ['constant-boolean-operand', 'false || load()', {}, 'load()'],
    ['constant-boolean-operand', 'ready && false', inCondition, 'false'],
    ['boolean-literal-ternary', 'ready ? true : false', {}, '!!ready'],
    ['boolean-literal-ternary', 'ready ? true : false', inCondition, 'ready'],
    ['boolean-literal-ternary', 'ready ? false : other', {}, '!ready && other'],
    ['negated-condition', '!ready ? a : b', {}, 'ready ? b : a'],
    ['comparison-orientation', 'limit > count', {}, 'count < limit'],
    ['commutative-order', 'b === a', {}, 'a === b'],
    ['commutative-order', 'b && a', inCondition, 'a && b'],
    ['logical-grouping', 'a && (b && load())', {}, 'a && b && load()'],
  ])('%s turns %s into its normal form', (rewrite, code, options, form) => {
    const result = simplified(expressionTerm(code), options);

    expect(result).toEqual({ form, rewrites: [rewrite] });
  });

  it.each([
    ['boolean-literal-return', 'if (a < b) return true; return false;', '{ return a < b; }'],
    [
      'boolean-literal-return',
      'if (ready) { return true; } else { return false; }',
      '{ return !!ready; }',
    ],
    ['boolean-literal-return', 'if (ready) return false; return true;', '{ return !ready; }'],
    ['nested-if-merge', 'if (a) { if (b) go(); }', '{ if (a && b) { go(); } }'],
    ['negated-condition', 'if (!a) x(); else y();', '{ if (a) { y(); } else { x(); } }'],
    ['else-after-return', 'if (a) { return 1; } else { go(); }', '{ if (a) { return 1; } go(); }'],
  ])('%s turns `%s` into its normal form', (rewrite, code, form) => {
    expect(simplified(bodyTerm(code))).toEqual({ form, rewrites: [rewrite] });
  });

  it.each([
    ['a double negation of a value that is not known to be boolean', '!!ready', {}],
    ['a constant operand that keeps a value, not a truth value', 'ready && true', {}],
    ['a dropped operand that can throw', 'load() && false', inCondition],
    ['a comparison with a call on one side', 'limit() > count', {}],
    ['a guard before the field read it protects', 'user && user.name', inCondition],
    ['a short-circuit chain in a value position', 'b || a', {}],
    ['a negated comparison, which is not its flipped comparison for NaN', '!(a < b)', {}],
    ['a nullish chain mixed with another operator', '(a ?? b) || c', inCondition],
    ['an equality with no negation to flip', 'a !== b', {}],
    ['a chain whose comparison can throw, so its order stays', 'ready || b < a', inCondition],
    ['an assignment passed to a call', 'f((a = b))', {}],
    ['a power whose base is negated', '(-a) ** b', {}],
    ['a power of a power', '(a ** b) ** c', {}],
    ['a method called on an integer', '(1).toFixed()', {}],
    ['a chain that is already grouped from the left', 'a && b && load()', {}],
    ['a ternary whose test is not negated', 'ready ? b : a', {}],
  ])('leaves %s as written', (_case, code, options) => {
    expect(simplified(expressionTerm(code), options)).toEqual({ form: code, rewrites: [] });
  });

  it.each([
    ['an outer if with an else branch', 'if (a) { if (b) go(); } else { stop(); }'],
    ['an inner if with an else branch', 'if (a) { if (b) go(); else stop(); }'],
    ['two branches that return the same literal', 'if (a) return true; return true;'],
    ['a branch that returns something other than a literal', 'if (a) return b; return false;'],
  ])('leaves %s as written', (_case, code) => {
    expect(simplified(bodyTerm(code)).rewrites).toEqual([]);
  });

  it.each([
    ['a constant', 'if (a) { return 1; } else { const b = 2; go(b); }'],
    ['a type alias', 'if (a) { return 1; } else { type T = number; go(); }'],
    ['an interface', 'if (a) { return 1; } else { interface T { b: number } go(); }'],
  ])('keeps an else branch that declares %s', (_case, code) => {
    expect(simplified(bodyTerm(code)).rewrites).toEqual([]);
  });

  it('records the source range of each rewritten expression', () => {
    const code = 'ok && !(a && b)';
    const { rewrites } = normalize(expressionTerm(code));

    expect(rewrites).toEqual([{ rewrite: 'de-morgan', range: [7, 16] }]);
  });

  it('treats a type assertion or a non-null assertion as the value it wraps', () => {
    expect(
      sameCondition(expressionTerm('(user as User).active!'), expressionTerm('user.active')),
    ).toBe(true);
  });

  it('compares conditions after normalizing both', () => {
    expect(
      sameCondition(
        expressionTerm('limit !== count && !!ready'),
        expressionTerm('ready && count !== limit'),
      ),
    ).toBe(true);
    expect(sameCondition(expressionTerm('!(a < b)'), expressionTerm('a >= b'))).toBe(false);
  });

  it('reads string and number literals by value, not by spelling', () => {
    expect(
      sameCondition(
        expressionTerm(`kind === 'a' || size === 0x10`),
        expressionTerm('kind === "a" || size === 16'),
      ),
    ).toBe(true);
  });

  it('marks the expressions the caller knows to be boolean', () => {
    const isBoolean = (node: TermNode) => node.type === 'Identifier' && node.name === 'ready';
    const ternary = expressionTerm('ready ? true : false', { isBoolean });

    expect(simplified(ternary)).toEqual({ form: 'ready', rewrites: ['boolean-literal-ternary'] });
  });

  it('marks the expressions the caller knows to be integers', () => {
    const isInteger = (node: TermNode) => node.type === 'Identifier' && node.name === 'count';
    const { children } = expressionTerm('count < limit', { isInteger });

    expect(children.map((child) => child.integer)).toEqual([true, undefined]);
  });
});
