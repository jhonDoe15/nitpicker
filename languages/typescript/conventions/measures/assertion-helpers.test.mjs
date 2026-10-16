import { describe, expect, it } from 'vitest';
import { conventionChoices, detectConventions } from '../../../../shared/conventions/detect.mjs';
import {
  describeConventions,
  validateConventions,
} from '../../../../shared/conventions/settings.mjs';
import { ASSERTION_HELPERS_CONVENTION, assertionFunctionNames } from './assertion-helpers.mjs';

const names = (text) => ASSERTION_HELPERS_CONVENTION.measure(text, 'src/a.test.ts');

describe('terminal assertion helpers', () => {
  it.each([
    ["it('a', () => {\n  run();\n  assertOk(result);\n});\n", ['assertOk']],
    ["it('a', async () => {\n  await verifyCalled(spy).times(2);\n});\n", ['verifyCalled']],
    ["test.each(rows)('a', (row) => checkRow(row));\n", ['checkRow']],
    ["it.skip('a', function () {\n  return ensureClosed(door);\n});\n", ['ensureClosed']],
    ["it('a', () => {\n  assertOk(a);\n  run();\n});\nconst x = () => assertLater();\n", []],
    ["it('a', () => {\n  expect(a).toBe(1);\n  expectTypeOf(a).toBeString();\n});\n", []],
    ["it('a', () => {\n  assert.equal(a, 1);\n});\n", []],
    ["it('a', () => {\n  checker(a);\n});\n", []],
    ["describe('a', () => {\n  shouldRender(a);\n});\n", []],
    ["it('a', () => {\n  assertOk(a);\n});\nit('b', () => {\n  assertOk(b);\n});\n", ['assertOk']],
    ["it('a', () => {\n  const result = assertOk(a);\n});\n", []],
    ["it('a', () => {\n  foo.assertOk(a);\n});\n", []],
    ["it('a', () => {\n  assertOk(a).and(b);\n});\n", ['assertOk']],
    ['const text = "assertOk(a)";\n', []],
  ])('%j gives %j', (text, expected) => {
    expect(names(text)).toEqual(expected);
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
  const call = (name) => `it('t', () => {\n  ${name}(value);\n});\n`;
  const detect = (files, pinned) =>
    detectConventions({
      definitions: [ASSERTION_HELPERS_CONVENTION],
      source: {
        paths: () => Object.keys(files),
        readMany: (paths) => new Map(paths.map((p) => [p, files[p]])),
      },
      pinned,
    })[ASSERTION_HELPERS_CONVENTION.id];

  it('follows helpers that end tests in at least three files', () => {
    const detected = detect({
      'a.test.ts': call('assertOk'),
      'b.test.ts': call('assertOk'),
      'c.test.ts': `${call('assertOk')}${call('verifyCalled')}`,
      'd.test.ts': call('verifyCalled'),
      'e.test.ts': call('expect'),
    });

    expect(detected).toEqual({
      choice: ['assertOk'],
      source: 'majority',
      counts: { assertOk: 3, verifyCalled: 2 },
      files: 5,
    });
    expect(
      conventionChoices({ [ASSERTION_HELPERS_CONVENTION.id]: detected }, [
        ASSERTION_HELPERS_CONVENTION,
      ]),
    ).toEqual({
      'typescript.assertionHelpers': ['assertOk'],
    });
  });

  it('keeps the default when no helper reaches three files', () => {
    const detected = detect({ 'a.test.ts': call('assertOk'), 'b.test.ts': call('assertOk') });

    expect(detected.choice).toEqual([]);
    expect(detected.source).toBe('default');
    expect(
      conventionChoices({ [ASSERTION_HELPERS_CONVENTION.id]: detected }, [
        ASSERTION_HELPERS_CONVENTION,
      ]),
    ).toEqual({});
  });

  it('describes what it follows and what is pinned', () => {
    const detected = detect({
      'a.test.ts': call('assertOk'),
      'b.test.ts': call('assertOk'),
      'c.test.ts': call('assertOk'),
    });

    expect(
      describeConventions({ x: detected }, [{ ...ASSERTION_HELPERS_CONVENTION, id: 'x' }]),
    ).toEqual(['Assertion helpers: assertOk (final call of at least 3 of 3 measured files)']);
    expect(
      describeConventions({ x: { choice: ['assertOk'], source: 'pinned', counts: {} } }, [
        { ...ASSERTION_HELPERS_CONVENTION, id: 'x' },
      ]),
    ).toEqual(['Assertion helpers: assertOk (set in nitpicker.config.json)']);
  });

  it('validates a pinned list of names', () => {
    const validate = (value) => {
      validateConventions({ 'typescript.assertionHelpers': value }, [ASSERTION_HELPERS_CONVENTION]);
    };
    const message = '"conventions.typescript.assertionHelpers" must be a list of function names';

    expect(() => {
      validate(['assertOk']);
    }).not.toThrow();
    expect(() => {
      validate('assertOk');
    }).toThrow(message);
    expect(() => {
      validate(['a b']);
    }).toThrow(message);
  });

  it('uses a pinned list without measuring', () => {
    expect(detect({}, { 'typescript.assertionHelpers': ['assertOk'] })).toEqual({
      choice: ['assertOk'],
      source: 'pinned',
      counts: {},
    });
  });
});
