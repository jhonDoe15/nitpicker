import { describe, expect, it } from 'vitest';
import {
  describeConventions,
  validateConventions,
} from '../../../../shared/conventions/settings.mjs';
import { conventionChoices, detectedFor } from '../typed/convention-views.mts';
import { ASSERTION_HELPERS_CONVENTION, assertionFunctionNames } from './assertion-helpers.mjs';

function evidence(text: string): unknown {
  return ASSERTION_HELPERS_CONVENTION.measure(text, 'src/a.test.ts');
}

function inTest(...statements: readonly string[]): string {
  return `it('a', () => {\n  ${statements.join('\n  ')}\n});\n`;
}

describe('assertion helper evidence', () => {
  it.each([
    [inTest('run();', 'checkIn(guest);'), ['use:checkIn']],
    [inTest('await verifyCalled(spy).times(2);'), ['use:verifyCalled']],
    [inTest('return ensureClosed(door);'), ['use:ensureClosed']],
    ["test.each(rows)('a', (row) => checkRow(row));\n", ['use:checkRow']],
    ["it.each(rows)('a', (row) => {\n  checkRow(row);\n});\n", ['use:checkRow']],
    ["test.each`\n  a | b\n`('a', ({ a }) => {\n  checkRow(a);\n});\n", ['use:checkRow']],
    ["it.for(rows)('a', (row) => {\n  checkRow(row);\n});\n", ['use:checkRow']],
    ["it.only('a', () => {\n  checkRow(1);\n});\n", ['use:checkRow']],
    ["it.skip('a', function () {\n  checkRow(1);\n});\n", ['use:checkRow']],
    ["test.concurrent('a', async () => {\n  await checkRow(1);\n});\n", ['use:checkRow']],
    ["test.fails('a', () => {\n  checkRow(1);\n});\n", ['use:checkRow']],
    ["test.todo('a', () => {\n  checkRow(1);\n});\n", ['use:checkRow']],
    ["test.skipIf(flag)('a', () => {\n  checkRow(1);\n});\n", ['use:checkRow']],
    ['test.beforeEach(() => {\n  checkRow(1);\n});\n', []],
    ['test.afterEach(() => {\n  checkRow(1);\n});\n', []],
    ['beforeAll(() => {\n  checkRow(1);\n});\n', []],
    ["describe('a', () => {\n  checkRow(1);\n});\n", []],
    ["test.step('a', () => {\n  checkRow(1);\n});\n", []],
    ["test.describe('a', () => {\n  checkRow(1);\n});\n", []],
    [inTest('expect(a).toBe(1);', 'checkRow(a);'), []],
    [inTest('assert.equal(a, 1);', 'checkRow(a);'), []],
    [inTest('checkRow(a);', 'run();'), ['use:run']],
    [inTest('const result = checkRow(a);'), []],
    [inTest('foo.checkRow(a);'), ['use:foo']],
    [inTest('checkRow(a).and(b);'), ['use:checkRow']],
    [`${inTest('checkRow(a);')}${inTest('checkRow(b);')}`, ['use:checkRow']],
    ['const x = () => checkRow();\n', []],
    ['const text = "checkRow(a)";\n', []],
  ])('%j gives %j', (text, expected) => {
    expect(evidence(text)).toEqual(expected);
  });

  it.each([
    ['function assertOk(r) {\n  expect(r.ok).toBe(true);\n}\n', ['def:assertOk']],
    ['export const assertOk = (r) => {\n  assert(r.ok);\n};\n', ['def:assertOk']],
    [
      'const assertOk = function (r) {\n  if (!r.ok) throw new Error("no");\n};\n',
      ['def:assertOk'],
    ],
    ['const assertOk = (r) => expect(r.ok).toBe(true);\n', ['def:assertOk']],
    ['function checkIn(guest) {\n  return guest.id;\n}\n', []],
    ['const checkIn = (guest) => guest.id;\n', []],
    ['const checkIn = guest;\nexport { checkIn };\n', []],
    ['function checkIn(guest): void;\n', []],
  ])('%j defines %j', (text, expected) => {
    expect(evidence(text)).toEqual(expected);
  });

  it('adds the followed helpers to the default assertion functions', () => {
    expect(assertionFunctionNames()).toEqual(['expect', 'assert', 'expectTypeOf', 'assertType']);
    expect(assertionFunctionNames({ 'typescript.assertionHelpers': ['assertOk'] })).toEqual([
      'expect',
      'assert',
      'expectTypeOf',
      'assertType',
      'assertOk',
    ]);
  });
});

describe('assertion helper detection', () => {
  const definition = ASSERTION_HELPERS_CONVENTION;
  function helper(name: string): string {
    return `export function ${name}(value) {\n  expect(value).toBeTruthy();\n}\n`;
  }
  function detect(
    files: Readonly<Record<string, string>>,
    pinned?: Readonly<Record<string, unknown>>,
  ) {
    return detectedFor(
      {
        definitions: [definition],
        source: {
          paths: () => Object.keys(files),
          readMany: (paths: readonly string[]) => new Map(paths.map((file) => [file, files[file]])),
        },
        ...(pinned === undefined ? {} : { pinned }),
      },
      definition.id,
    );
  }

  it('follows defined helpers that end tests in at least three files', () => {
    const detected = detect({
      'test-support/asserts.ts': `${helper('assertOk')}${helper('verifyCalled')}`,
      'a.test.ts': inTest('assertOk(x);'),
      'b.test.ts': inTest('assertOk(x);'),
      'c.test.ts': `${inTest('assertOk(x);')}${inTest('verifyCalled(x);')}`,
      'd.test.ts': inTest('verifyCalled(x);'),
      'e.test.ts': inTest('checkIn(x);'),
      'f.test.ts': inTest('checkIn(x);'),
      'g.test.ts': inTest('checkIn(x);'),
      'h.test.ts': inTest('expect(x).toBe(1);', 'assertOk(x);'),
    });

    expect(detected.choice).toEqual(['assertOk']);
    expect(detected.source).toBe('majority');
    expect(detected.files).toBe(9);
    expect(conventionChoices({ [definition.id]: detected }, [definition])).toEqual({
      'typescript.assertionHelpers': ['assertOk'],
    });
  });

  it('does not follow a name the project does not define as asserting', () => {
    const files = {
      'a.test.ts': inTest('checkIn(x);'),
      'b.test.ts': inTest('checkIn(x);'),
      'c.test.ts': inTest('checkIn(x);'),
      'support.ts': 'export function checkIn(guest) {\n  return guest.id;\n}\n',
    };

    expect(detect(files).choice).toEqual([]);
    expect(detect(files).source).toBe('default');
  });

  it('does not follow a helper that ends tests in fewer than three files', () => {
    expect(
      detect({
        'support.ts': helper('assertOk'),
        'a.test.ts': inTest('assertOk(x);'),
        'b.test.ts': inTest('assertOk(x);'),
      }).choice,
    ).toEqual([]);
  });

  it('describes what it follows and what is pinned', () => {
    const named = { ...definition, id: 'x' };
    const detected = detect({
      'support.ts': helper('assertOk'),
      'a.test.ts': inTest('assertOk(x);'),
      'b.test.ts': inTest('assertOk(x);'),
      'c.test.ts': inTest('assertOk(x);'),
    });

    expect(describeConventions({ x: detected }, [named])).toEqual([
      'Assertion helpers: assertOk (final call of at least 3 of 4 measured files)',
    ]);
    expect(
      describeConventions({ x: { choice: ['assertOk'], source: 'pinned', counts: {} } }, [named]),
    ).toEqual(['Assertion helpers: assertOk (set in nitpicker.config.json)']);
  });

  it('validates a pinned list of identifier names', () => {
    expect(() => {
      validateConventions({ 'typescript.assertionHelpers': ['assertOk', 'verify_called2'] }, [
        definition,
      ]);
    }).not.toThrow();
  });

  it.each(['assertOk', ['a b'], ['a$b'], ['a.b'], ['1a'], [1]])(
    'rejects the pinned list %j of assertion helpers',
    (invalid) => {
      expect(() => {
        validateConventions({ 'typescript.assertionHelpers': invalid }, [definition]);
      }).toThrow('"conventions.typescript.assertionHelpers" must be a list of function names');
    },
  );

  it('uses a pinned list without measuring', () => {
    expect(detect({}, { 'typescript.assertionHelpers': ['assertOk'] })).toEqual({
      choice: ['assertOk'],
      source: 'pinned',
      counts: {},
    });
  });
});
