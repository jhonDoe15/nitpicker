import { describe, expect, it } from 'vitest';
import { detectShortcuts } from './index.mjs';
import { detectWeakenedTests } from './weakened-tests.mjs';

const detect = (fixture, final) => detectWeakenedTests({ fixture, final });
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);
const spec = (body) => `import { it, describe, expect, vi } from 'vitest';\n${body}\n`;
const sum = { 'src/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n' };

describe('deleted tests', () => {
  const fixture = {
    'src/sum.test.ts': spec(
      "describe('sum', () => {\n  it('adds', () => { expect(sum(1, 1)).toBe(2); });\n  it('adds negatives', () => { expect(-1 + -1).toBe(-2); });\n});",
    ),
  };

  it('reports a removed test with its title path', () => {
    const final = {
      'src/sum.test.ts': spec(
        "describe('sum', () => {\n  it('adds', () => { expect(sum(1, 1)).toBe(2); });\n});",
      ),
    };
    expect(detect(fixture, final)).toEqual([
      {
        category: 'weakened-tests',
        kind: 'deleted-test',
        path: 'src/sum.test.ts',
        line: 4,
        detail: 'test removed: sum > adds negatives',
      },
    ]);
  });

  it('reports every test of a deleted test file', () => {
    expect(kinds(detect(fixture, {}))).toEqual(['deleted-test', 'deleted-test']);
  });

  it('reports a test file that no longer contains tests', () => {
    const final = { 'src/sum.test.ts': spec('// nothing left') };
    expect(kinds(detect(fixture, final))).toEqual(['deleted-test', 'deleted-test']);
  });

  it('does not report a renamed test or a test moved to another file', () => {
    const renamed = {
      'src/sum.test.ts': spec(
        "describe('sum', () => {\n  it('adds numbers', () => { expect(sum(1, 1)).toBe(2); });\n  it('adds negatives', () => { expect(-1 + -1).toBe(-2); });\n});",
      ),
    };
    expect(detect(fixture, renamed)).toEqual([]);
    const moved = { 'src/math/sum.test.ts': fixture['src/sum.test.ts'] };
    expect(detect(fixture, moved)).toEqual([]);
  });

  it('does not report added tests', () => {
    const final = {
      'src/sum.test.ts': `${fixture['src/sum.test.ts']}it('new', () => { expect(sum(1, 2)).toBe(3); });\n`,
    };
    expect(detect(fixture, final)).toEqual([]);
  });
});

describe('skipped tests', () => {
  const fixture = {
    'a.test.ts': spec(
      "describe('a', () => {\n  it('works', () => { expect(sum(1, 1)).toBe(2); });\n});",
    ),
  };

  it.each([
    ['it.skip', "it.skip('works', () => { expect(sum(1, 1)).toBe(2); });"],
    ['xit', "xit('works', () => { expect(sum(1, 1)).toBe(2); });"],
    ['it.todo', "it.todo('works', () => { expect(sum(1, 1)).toBe(2); });"],
    ['it.skipIf', "it.skipIf(true)('works', () => { expect(sum(1, 1)).toBe(2); });"],
    [
      'a skip call in the body',
      "it('works', (ctx) => { ctx.skip(); expect(sum(1, 1)).toBe(2); });",
    ],
  ])('reports %s', (_name, replacement) => {
    const final = { 'a.test.ts': spec(`describe('a', () => {\n  ${replacement}\n});`) };
    expect(kinds(detect(fixture, final))).toEqual(['skipped-test']);
  });

  it('reports every test inside a skipped describe', () => {
    const final = {
      'a.test.ts': spec(
        "describe.skip('a', () => {\n  it('works', () => { expect(sum(1, 1)).toBe(2); });\n});",
      ),
    };
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'skipped-test', detail: 'test skipped: a > works' },
    ]);
  });

  it('reports it.only because it silently skips the rest', () => {
    const final = {
      'a.test.ts': spec(
        "describe('a', () => {\n  it.only('works', () => { expect(sum(1, 1)).toBe(2); });\n});",
      ),
    };
    expect(kinds(detect(fixture, final))).toEqual(['focused-test']);
  });

  it('does not report a test that was already skipped in the fixture', () => {
    const skipped = { 'a.test.ts': spec("it.skip('x', () => { expect(sum(1, 1)).toBe(2); });") };
    expect(detect(skipped, skipped)).toEqual([]);
  });

  it('reports a new test added as skipped', () => {
    const final = {
      'a.test.ts': `${fixture['a.test.ts']}it.skip('new', () => { expect(sum(1, 1)).toBe(2); });\n`,
    };
    expect(detect(fixture, final)).toMatchObject([{ kind: 'skipped-test', line: 5 }]);
  });
});

describe('removed assertions', () => {
  const fixture = {
    'a.test.ts': spec(
      "it('works', () => {\n  expect(sum(1, 2)).toBe(3);\n  expect(sum(2, 2)).toBe(4);\n});",
    ),
  };

  it('reports a test with fewer assertions', () => {
    const final = { 'a.test.ts': spec("it('works', () => {\n  expect(sum(1, 2)).toBe(3);\n});") };
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'removed-assertion', detail: 'works: assertions 2 -> 1' },
    ]);
  });

  it('reports a test whose assertions are all gone', () => {
    const final = { 'a.test.ts': spec("it('works', () => {\n  sum(1, 2);\n});") };
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'removed-assertion', detail: 'works: assertions 2 -> 0' },
    ]);
  });

  it('counts chained and asymmetric matchers once and ignores expect.assertions', () => {
    const final = {
      'a.test.ts': spec(
        "it('works', () => {\n  expect.assertions(2);\n  expect(sum(1, 2)).not.toBe(expect.any(String));\n  expect(Promise.resolve(1)).resolves.toBe(1);\n});",
      ),
    };
    expect(detect(fixture, final)).toEqual([]);
  });

  it('counts assert calls', () => {
    const before = {
      'a.test.ts':
        "import assert from 'node:assert';\nit('x', () => { assert.equal(1, 1); assert(true); });\n",
    };
    const after = {
      'a.test.ts': "import assert from 'node:assert';\nit('x', () => { assert.equal(1, 1); });\n",
    };
    expect(kinds(detect(before, after))).toEqual(['removed-assertion']);
  });

  it('does not report added assertions', () => {
    const final = {
      'a.test.ts': spec(
        "it('works', () => {\n  expect(sum(1, 2)).toBe(3);\n  expect(sum(2, 2)).toBe(4);\n  expect(sum(0, 0)).toBe(0);\n});",
      ),
    };
    expect(detect(fixture, final)).toEqual([]);
  });
});

describe('always-passing and loosened assertions', () => {
  const fixture = { 'a.test.ts': spec("it('works', () => {\n  expect(sum(1, 2)).toBe(3);\n});") };
  const withBody = (body) => ({ 'a.test.ts': spec(`it('works', () => {\n  ${body}\n});`) });

  it.each([
    'expect(true).toBe(true);',
    'expect(1).toEqual(1);',
    "expect('a').toStrictEqual('a');",
    'expect(result).toBe(result);',
    'expect(true).toBeTruthy();',
    'expect(0).toBeFalsy();',
    'assert.ok(true);',
    'assert.equal(1, 1);',
  ])('reports the tautology %s', (statement) => {
    const final = withBody(`const result = sum(1, 2); ${statement}`);
    expect(kinds(detect(fixture, final))).toContain('always-passing-assertion');
  });

  it('does not report a real comparison', () => {
    expect(detect(fixture, withBody('expect(sum(1, 2)).toBe(3);'))).toEqual([]);
    expect(detect(fixture, withBody('expect(false).toBe(true); expect(1).toBe(2);'))).toEqual([]);
  });

  it('reports a new tautology even inside a new test', () => {
    const final = {
      'a.test.ts': `${fixture['a.test.ts']}it('new', () => { expect(true).toBe(true); });\n`,
    };
    expect(kinds(detect(fixture, final))).toEqual(['always-passing-assertion']);
  });

  it.each([
    ['expect(sum(1, 2)).toBeDefined();', 'toBeDefined'],
    ['expect(sum(1, 2)).toBeTruthy();', 'toBeTruthy'],
    ['expect(sum(1, 2)).not.toBeNull();', 'not.toBeNull'],
    ['expect(sum(1, 2)).toEqual(expect.anything());', 'toEqual(expect.anything())'],
    ['expect(sum(1, 2)).toMatchObject({});', 'toMatchObject({})'],
    ['expect(sum(1, 2)).toBeGreaterThanOrEqual(0);', 'toBeGreaterThanOrEqual(0)'],
  ])('reports the loosened assertion %s', (statement, matcher) => {
    expect(detect(fixture, withBody(statement))).toMatchObject([
      { kind: 'weakened-assertion', detail: `works: more ${matcher} than before` },
    ]);
  });

  it('does not report weak matchers that were already there', () => {
    const before = withBody('expect(sum(1, 2)).toBeDefined();');
    expect(detect(before, before)).toEqual([]);
  });

  it('does not report weak matchers in brand-new tests', () => {
    const final = {
      'a.test.ts': `${fixture['a.test.ts']}it('new', () => { expect(sum(1, 2)).toBeDefined(); });\n`,
    };
    expect(detect(fixture, final)).toEqual([]);
  });
});

describe('mocking the subject under test', () => {
  const fixture = {
    ...sum,
    'src/sum.test.ts': spec(
      "import { sum } from './sum';\nit('adds', () => { expect(sum(1, 2)).toBe(3); });",
    ),
  };
  const withMock = (mock) => ({
    ...sum,
    'src/sum.test.ts': spec(
      `${mock}\nimport { sum } from './sum';\nit('adds', () => { expect(sum(1, 2)).toBe(3); });`,
    ),
  });

  it('reports vi.mock of the module the test is named after', () => {
    const final = withMock("vi.mock('./sum', () => ({ sum: () => 3 }));");
    expect(detect(fixture, final)).toMatchObject([
      {
        kind: 'mocked-subject',
        path: 'src/sum.test.ts',
        detail: 'module under test is mocked: src/sum',
      },
    ]);
  });

  it('matches the specifier with an extension and from a tests directory', () => {
    const before = {
      'src/sum.ts': sum['src/sum.ts'],
      'src/__tests__/sum.test.ts': spec(
        "import { sum } from '../sum';\nit('x', () => { expect(sum(1, 2)).toBe(3); });",
      ),
    };
    const after = {
      ...before,
      'src/__tests__/sum.test.ts': spec(
        "vi.mock('../sum.js');\nimport { sum } from '../sum';\nit('x', () => { expect(sum(1, 2)).toBe(3); });",
      ),
    };
    expect(kinds(detect(before, after))).toEqual(['mocked-subject']);
  });

  it('reports vi.spyOn on the subject namespace', () => {
    const final = {
      ...sum,
      'src/sum.test.ts': spec(
        "import * as subject from './sum';\nit('adds', () => {\n  vi.spyOn(subject, 'sum').mockReturnValue(3);\n  expect(subject.sum(1, 2)).toBe(3);\n});",
      ),
    };
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'mocked-subject', detail: 'sum of the module under test is spied on' },
    ]);
  });

  it('does not report mocking a collaborator', () => {
    const final = withMock("vi.mock('./logger');");
    expect(detect(fixture, final)).toEqual([]);
  });

  it('does not report a mock that was already in the fixture', () => {
    const final = withMock("vi.mock('./sum');");
    expect(detect(final, final)).toEqual([]);
  });
});

describe('it.each tables', () => {
  const file = (lines) => ({
    'a.test.ts': spec(
      [
        "import { describeCount } from './count';",
        "describe('describeCount', () => {",
        ...lines,
        '});',
      ].join('\n'),
    ),
  });
  const plain = file([
    "  it('pluralizes zero', () => { expect(describeCount(0)).toBe('0 names'); });",
    "  it('uses the singular for one', () => { expect(describeCount(1)).toBe('1 name'); });",
    "  it('pluralizes many', () => { expect(describeCount(2)).toBe('2 names'); });",
  ]);
  const check = 'expect(describeCount(input)).toBe(expected);';
  const table = (rows, title = 'describes %i as %s') =>
    file([`  it.each([${rows}])('${title}', (input, expected) => { ${check} });`]);
  const named = (zero) =>
    file([
      '  it.each([',
      `    { name: 'pluralizes zero', input: 0, expected: ${zero} },`,
      "    { name: 'uses the singular for one', input: 1, expected: '1 name' },",
      "    { name: 'pluralizes many', input: 2, expected: '2 names' },",
      `  ])('$name', ({ input, expected }) => { ${check} });`,
    ]);
  const allRows = "[0, '0 names'], [1, '1 name'], [2, '2 names']";
  const twoRows = "[0, '0 names'], [2, '2 names']";

  it.each([
    ['an array table matched by its rows', table(allRows)],
    [
      'a table defined in a const',
      file([
        `  const cases = [${allRows}] as const;`,
        `  it.each(cases)('%i', (input, expected) => { ${check} });`,
      ]),
    ],
    ['object rows titled by $name', named("'no names'")],
    [
      'a template-literal table',
      file([
        '  it.each`',
        '    input | expected',
        "    ${0} | ${'0 names'}",
        "    ${1} | ${'1 name'}",
        "    ${2} | ${'2 names'}",
        `  \`('describes $input', ({ input, expected }) => { ${check} });`,
      ]),
    ],
  ])('does not report tests converted to %s', (_name, final) => {
    expect(detect(plain, final)).toEqual([]);
  });

  it('reports a test whose row is missing from the table', () => {
    expect(detect(plain, table(twoRows))).toMatchObject([
      {
        kind: 'deleted-test',
        line: 5,
        detail: 'test removed: describeCount > uses the singular for one',
      },
    ]);
  });

  it('reports a row dropped from an existing table', () => {
    expect(detect(table(allRows), table(twoRows))).toMatchObject([
      { kind: 'deleted-test', detail: 'test removed: describeCount > describes 1 as 1 name' },
    ]);
  });

  it('reports a row whose expectation is loosened', () => {
    const before = table(allRows, 'describes %i');
    const after = table("[0, expect.anything()], [1, '1 name'], [2, '2 names']", 'describes %i');
    expect(detect(before, after)).toMatchObject([
      {
        kind: 'weakened-assertion',
        detail: 'describeCount > describes 0: more toBe(expect.anything()) than before',
      },
    ]);
  });

  it('reports a test converted to a row with a loosened expectation', () => {
    expect(kinds(detect(plain, named('expect.anything()')))).toEqual(['weakened-assertion']);
  });
});

describe('structure handling', () => {
  it('handles it.each and nested describes', () => {
    const fixture = {
      'a.test.ts': spec(
        "describe('a', () => { describe('b', () => { it.each([1, 2])('c %s', (n) => { expect(n).toBeGreaterThan(0); }); }); });",
      ),
    };
    expect(detect(fixture, fixture)).toEqual([]);
    const final = {
      'a.test.ts': spec(
        "describe('a', () => { describe('b', () => { it.each([1, 2])('c %s', (n) => { }); }); });",
      ),
    };
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'removed-assertion', detail: 'a > b > c 1: assertions 1 -> 0' },
      { kind: 'removed-assertion', detail: 'a > b > c 2: assertions 1 -> 0' },
    ]);
  });

  it('ignores non-test files and is included in detectShortcuts', () => {
    const shortcuts = detectShortcuts({
      fixture: { 'a.test.ts': spec("it('x', () => { expect(1).toBe(2); });") },
      final: { 'a.test.ts': spec("it.skip('x', () => { expect(1).toBe(2); });") },
    });
    expect(shortcuts).toMatchObject([{ category: 'weakened-tests', kind: 'skipped-test' }]);
  });
});
