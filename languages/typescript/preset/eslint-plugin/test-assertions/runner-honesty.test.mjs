import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
import { rule as noUnpinnedAssertion } from './no-unpinned-assertion.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

tester.run('no-switched-off-tests under node:test, Mocha and test options', noSwitchedOffTests, {
  valid: [
    "test('x', { skip: process.platform === 'win32' }, () => {});",
    "test('x', { timeout: 100 }, () => {});",
    "it('x', { todo: false }, () => {});",
    "test('x', (t) => { if (process.platform === 'win32') { t.skip(); } run(); });",
    "it('x', function () { if (!hasDocker()) { this.skip(); } run(); });",
    "it('x', () => { cursor.skip(); });",
    "it('x', (t) => { items.todo(); });",
    "test('x', ({ skip }) => { skip(process.platform === 'win32'); run(); });",
    "test('x', (ctx) => { ctx.skip(!hasDocker, 'needs Docker'); run(); });",
    "test('x', { skip: `${reason}` }, () => {});",
    "test.step('x', () => { setUp(); });",
    "t.test('sub', { skip: process.platform === 'win32' }, () => {});",
    "const passes = pattern.test('x');",
  ],
  invalid: [
    {
      code: "test('x', { skip: true }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "it('x', { skip: 'flaky on CI' }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "describe('x', { todo: true }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "test('x', (t) => { t.skip('later'); run(); });",
      errors: [{ messageId: 'unconditionalSkip' }],
    },
    {
      code: "test('x', (t) => { t.todo(); });",
      errors: [{ messageId: 'unconditionalSkip' }],
    },
    {
      code: "it('x', function () { this.skip(); });",
      errors: [{ messageId: 'unconditionalSkip' }],
    },
    {
      code: "t.test('sub', { skip: true }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "specify('x', { skip: 'later' }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "context('x', { todo: true }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "test.describe('x', { skip: true }, () => {});",
      errors: [{ messageId: 'fixedOption' }],
    },
    {
      code: "it('x', ({ skip }) => { skip(); });",
      errors: [{ messageId: 'unconditionalSkip' }],
    },
  ],
});

tester.run('no-unpinned-assertion', noUnpinnedAssertion, {
  valid: [
    'assert.strictEqual(result, 3);',
    'assert.ok(result > 2);',
    "assert.ok(isValid('x'));",
    "assert.throws(() => run(), { message: 'bad' });",
    'await assert.rejects(load(), LoadError);',
    'assert.doesNotThrow(() => run());',
    "expect(result).to.equal('x');",
    'expect(result).to.not.exist;',
    'expect(result).to.be.null;',
    "expect(() => run()).to.throw(RangeError, 'bad');",
    "await expect(load()).to.be.rejectedWith(LoadError, 'bad');",
    "expect(spy).to.have.been.calledWith('x');",
    'expect(spy).to.not.have.been.called;',
    "sinon.assert.calledWith(spy, 'x');",
    'sinon.assert.calledOnce(spy);',
    'expect(value).toBeDefined();',
    'const ok = response.ok;',
    'expect(() => run()).to.not.throw();',
    'await expect(load()).to.not.be.rejected;',
    "assert.fail('unreachable');",
    "import { strictEqual } from 'node:assert/strict'; strictEqual(result, 3);",
    "assert.strict.equal(result, 'x');",
  ],
  invalid: [
    { code: 'assert.ok(result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert(result.value);', errors: [{ messageId: 'unpinned' }] },
    { code: 't.assert.ok(result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.isOk(result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.exists(result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.isDefined(result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.isNotNull(result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'expect(result).to.be.ok;', errors: [{ messageId: 'unpinned' }] },
    { code: 'expect(result).not.to.be.ok;', errors: [{ messageId: 'unpinned' }] },
    { code: 'expect(result).to.exist;', errors: [{ messageId: 'unpinned' }] },
    { code: 'expect(result).to.not.be.null;', errors: [{ messageId: 'unpinned' }] },
    { code: 'expect(result).not.undefined;', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.throws(() => run());', errors: [{ messageId: 'unpinnedFailure' }] },
    { code: 'await assert.rejects(load());', errors: [{ messageId: 'unpinnedFailure' }] },
    { code: 'expect(() => run()).to.throw();', errors: [{ messageId: 'unpinnedFailure' }] },
    {
      code: 'await expect(load()).to.be.rejected;',
      errors: [{ messageId: 'unpinnedFailure' }],
    },
    { code: 'assert.ok(result!);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.ok(result?.value);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.ok(!!result);', errors: [{ messageId: 'unpinned' }] },
    { code: 'assert.strict.ok(result);', errors: [{ messageId: 'unpinned' }] },
    {
      code: "import { ok } from 'node:assert'; ok(result);",
      errors: [{ messageId: 'unpinned' }],
    },
    {
      code: "import check from 'node:assert/strict'; check.ok(result);",
      errors: [{ messageId: 'unpinned' }],
    },
    {
      code: "const { throws } = require('node:assert'); throws(() => run());",
      errors: [{ messageId: 'unpinnedFailure' }],
    },
    {
      code: "import { assert as check } from 'chai'; check.isOk(result);",
      errors: [{ messageId: 'unpinned' }],
    },
    { code: 'assert(true);', errors: [{ messageId: 'literalSubject' }] },
    { code: 'assert.ok(true);', errors: [{ messageId: 'literalSubject' }] },
    { code: 'assert.strictEqual(1, 1);', errors: [{ messageId: 'literalSubject' }] },
    { code: 'sinon.assert.called(spy);', errors: [{ messageId: 'bareCall' }] },
    { code: 'expect(spy).to.have.been.called;', errors: [{ messageId: 'bareCall' }] },
  ],
});

describe('the unpinned assertion messages', () => {
  it('name the form and the exact assertion of the style in use', () => {
    const messages = noUnpinnedAssertion.meta.messages;

    expect(
      [
        messages.unpinned,
        messages.unpinnedFailure,
        messages.literalSubject,
        messages.bareCall,
      ].join('\n'),
    ).toBe(
      [
        '`{{form}}` passes for many values. Assert the exact value with {{exact}}. An exception fits only when the value cannot be pinned.',
        "`{{form}}` without the expected error passes for any failure. Pass the error class or message: `assert.throws(run, { message: '...' })`, `expect(run).to.throw(SpecificError, '...')` or `.rejectedWith(SpecificError, '...')`. An exception fits only when the value cannot be pinned.",
        'A literal passed as the value under test can never fail. Pass the value the code under test returns as the first argument of `{{form}}`. An exception fits only when the value cannot be pinned.',
        'A bare `{{form}}` check passes for a call with any arguments. Assert them with `calledWith(...)`: `sinon.assert.calledWith(spy, ...)` or `expect(spy).to.have.been.calledWith(...)`. An exception fits only when the arguments cannot be pinned.',
      ].join('\n'),
    );
  });
});
