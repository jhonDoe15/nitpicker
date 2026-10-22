import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { rule } from '../../rules/testing/assertions/no-partial-output-assertion.mjs';

const EXCEPTION_FOR_OUTPUT =
  'An exception fits only when the output is too large or unordered to pin.';
const EXCEPTION_FOR_VALUE =
  'An exception fits only when the value is too large or unordered to pin.';
const ON_ITS_OWN =
  'For a field that varies, assert it on its own and compare the rest of the value whole.';

const OUTPUT_ASSERTIONS = {
  vitest: '`toEqual` or `toBe`',
  jest: '`toEqual` or `toBe`',
  node: '`assert.deepStrictEqual` or `assert.strictEqual`',
  mocha: '`expect(...).to.deep.equal` or `assert.deepStrictEqual`',
};
const FRAGMENT_FORMS = {
  vitest: '`toContain`, or `toMatch` with a pattern that is not anchored `^...$`',
  jest: '`toContain`, or `toMatch` with a pattern that is not anchored `^...$`',
  node: "`assert.ok(text.includes('x'))`, or `assert.match` with a pattern that is not anchored `^...$`",
  mocha:
    '`include`, `contain` or `string` with text, or `match` with a pattern that is not anchored `^...$`',
};
const VALUE_ASSERTIONS = {
  vitest: [
    '`toEqual`',
    '`toMatchObject`, `expect.objectContaining`, `expect.stringContaining`, `expect.arrayContaining`',
    'Use `expect.any(Type)` for a field that varies.',
  ],
  node: ['`assert.deepStrictEqual`', '`assert.partialDeepStrictEqual`', ON_ITS_OWN],
  mocha: [
    '`expect(...).to.deep.equal` or `assert.deepStrictEqual`',
    '`include` or `contain` with an object, `include.members`, `containSubset`, `assert.partialDeepStrictEqual`',
    ON_ITS_OWN,
  ],
};

function outputMessage(runner) {
  return `Assert the whole output with ${OUTPUT_ASSERTIONS[runner]} instead of checking that it contains a fragment (${FRAGMENT_FORMS[runner]}): a fragment passes even when the rest is wrong. ${EXCEPTION_FOR_OUTPUT}`;
}

function valueMessage(runner) {
  const [whole, partial, varied] = VALUE_ASSERTIONS[runner];
  return `Pass the whole expected value to ${whole} instead of a partial match (${partial}): the rest of the value goes unchecked. ${varied} ${EXCEPTION_FOR_VALUE}`;
}

function messagesFor(code, runner) {
  return new Linter()
    .verify(code, [
      {
        files: ['**/*.js'],
        plugins: { nitpicker: { rules: { 'no-partial-output-assertion': rule } } },
        languageOptions: { sourceType: 'module' },
        rules: { 'nitpicker/no-partial-output-assertion': ['error', { runner }] },
      },
    ])
    .map(({ message }) => message);
}

describe('partial output assertions under node:test', () => {
  it.each([
    "assert.ok(output.includes('fragment'));",
    "assert(output.includes('fragment'));",
    "t.assert.ok(output.includes('fragment'));",
  ])('reports %s', (code) => {
    expect(messagesFor(code, 'node')).toEqual([outputMessage('node')]);
  });

  it.each([
    'assert.partialDeepStrictEqual(actual, { id: 1 });',
    't.assert.partialDeepStrictEqual(actual, { id: 1 });',
  ])('reports the partial deep comparison %s', (code) => {
    expect(messagesFor(code, 'node')).toEqual([valueMessage('node')]);
  });

  it.each([
    "assert.deepStrictEqual(output, 'whole');",
    'assert.ok(list.includes(item));',
    "assert.ok(!output.includes('secret'));",
    'assert.doesNotMatch(output, /secret/u);',
  ])('accepts %s', (code) => {
    expect(messagesFor(code, 'node')).toEqual([]);
  });
});

describe('partial output assertions with Chai under Mocha', () => {
  it.each([
    "expect(output).to.include('fragment');",
    "expect(output).to.contain('fragment');",
    'expect(output).to.have.string(`line ${n}`);',
    'expect(list).to.deep.include({ id: 1 });',
    "assert.include(output, 'fragment');",
    'assert.deepInclude(list, { id: 1 });',
    "assert.isTrue(output.includes('fragment'));",
  ])('reports %s', (code) => {
    expect(messagesFor(code, 'mocha')).toEqual([outputMessage('mocha')]);
  });

  it.each([
    'expect(actual).to.include({ id: 1 });',
    'expect(list).to.include.members([1, 2]);',
    'expect(actual).to.containSubset({ id: 1 });',
    'assert.include(actual, { id: 1 });',
    'assert.includeMembers(list, [1, 2]);',
    'assert.containSubset(actual, { id: 1 });',
  ])('reports the partial match %s', (code) => {
    expect(messagesFor(code, 'mocha')).toEqual([valueMessage('mocha')]);
  });

  it.each([
    'expect(actual).to.deep.equal({ id: 1 });',
    "expect(output).to.not.include('secret');",
    'expect(list).to.include(item);',
    "assert.notInclude(output, 'secret');",
    'expect(list).to.have.members([1, 2]);',
  ])('accepts %s', (code) => {
    expect(messagesFor(code, 'mocha')).toEqual([]);
  });
});

describe('the messages of each runner', () => {
  it.each(['vitest', 'jest', 'node', 'mocha'])(
    'names the whole-output assertion of %s for an expect fragment',
    (runner) => {
      expect(messagesFor("expect(output).toContain('fragment');", runner)).toEqual([
        outputMessage(runner),
      ]);
    },
  );

  it('keeps the expect matchers in the Vitest partial match message', () => {
    expect(messagesFor('expect(actual).toMatchObject({ id: 1 });', 'vitest')).toEqual([
      valueMessage('vitest'),
    ]);
  });

  it('reports a Chai fragment under Vitest, which ships the Chai API', () => {
    expect(messagesFor("expect(output).to.include('fragment');", 'vitest')).toEqual([
      outputMessage('vitest'),
    ]);
  });
});
