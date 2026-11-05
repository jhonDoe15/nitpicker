import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule } from './no-weak-assertion.mjs';

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
const filename = '/repo/test/orders.test.ts';

function flagged(code, messageId, found, absent = '') {
  return { filename, code, errors: [{ messageId, data: { found, absent } }] };
}

const presence = (code, found, absent) => flagged(code, 'presenceMatcher', found, absent);
const nonEmpty = (code, found) => flagged(code, 'nonEmptyMatcher', found);
const wildcard = (code, found) => flagged(code, 'wildcardCall', found);
const assertPresence = (code, found, absent) => flagged(code, 'presenceAssert', found, absent);
const assertNonEmpty = (code, found) => flagged(code, 'nonEmptyAssert', found);

tester.run('no-weak-assertion presence', rule, {
  valid: [
    'expect(user).toEqual({ id: 1 });',
    'expect(user).toBe(null);',
    'expect(user).not.toBe(other);',
    'expect(user).not.toEqual(0);',
    'expect(user).not.toEqual({});',
    'expect(user).toBe(undefined);',
    'user.not.toBe(null);',
    'subject(user).not.toBe(null);',
    'expect(user).not.toBeNull();',
    'assert.strictEqual(user.id, 1);',
    'assert.notStrictEqual(user, other);',
    'assert.notEqual(user, 0);',
    'assert.equal(user, null);',
    'assert(user === null);',
    'assert.ok(user === undefined);',
    'assert.ok(user);',
    'assert.ok(user != other);',
    'assert.ok();',
    'check.ok(user != null);',
    'assert.deepStrictEqual(user, { id: 1 });',
    'it("a", () => { assert(user !== undefined); expect(user.id).toBe(1); });',
    'it("a", () => { assert.ok(user != null); use(user); });',
    'it("a", () => { assert.strict.ok(order.id != null); send(order.id); });',
    'it("a", () => { assert(null !== user); expect(user?.name).toBe("a"); });',
    'it("a", () => { assert(user != null); if (ready) { check(`${user}`); } });',
  ],
  invalid: [
    presence('expect(user).not.toBe(null);', 'expect(…).not.toBe(null)', 'null'),
    presence('expect(user).not.toBe(undefined);', 'expect(…).not.toBe(undefined)', 'undefined'),
    presence('expect(user).not.toEqual(null);', 'expect(…).not.toEqual(null)', 'null'),
    presence(
      'expect(user).not.toStrictEqual(undefined);',
      'expect(…).not.toStrictEqual(undefined)',
      'undefined',
    ),
    presence('expect(user).not.toBe(void 0);', 'expect(…).not.toBe(void 0)', 'undefined'),
    presence(
      'await expect(load()).resolves.not.toBe(null);',
      'expect(…).resolves.not.toBe(null)',
      'null',
    ),
    presence(
      'await expect(load()).rejects.not.toEqual(undefined);',
      'expect(…).rejects.not.toEqual(undefined)',
      'undefined',
    ),
    presence('expect.soft(user).not.toBe(null);', 'expect(…).not.toBe(null)', 'null'),
    assertPresence('assert.notEqual(user, null);', 'assert.notEqual(…, null)', 'null'),
    assertPresence(
      'assert.notStrictEqual(user, undefined);',
      'assert.notStrictEqual(…, undefined)',
      'undefined',
    ),
    assertPresence(
      'assert.strict.notEqual(null, user);',
      'assert.strict.notEqual(null, …)',
      'null',
    ),
    assertPresence('assert(user != null);', 'assert(… != null)', 'null'),
    assertPresence('assert(user !== undefined);', 'assert(… !== undefined)', 'undefined'),
    assertPresence('assert.ok(null !== user);', 'assert.ok(null !== …)', 'null'),
    assertPresence(
      'assert.strict.ok(user != undefined, "set");',
      'assert.strict.ok(… != undefined)',
      'undefined',
    ),
    assertPresence(
      'it("a", () => { assert(user != null); expect(other.id).toBe(1); });',
      'assert(… != null)',
      'null',
    ),
    assertPresence(
      'it("a", () => { expect(user.id).toBe(1); assert(user != null); });',
      'assert(… != null)',
      'null',
    ),
    assertPresence(
      'it("a", () => { assert(user != null); check("user"); check(other.user); });',
      'assert(… != null)',
      'null',
    ),
    assertPresence(
      'it("a", () => { assert(load() !== undefined); load(); });',
      'assert(… !== undefined)',
      'undefined',
    ),
    assertPresence(
      'it("a", () => { assert.notEqual(user, null); expect(user.id).toBe(1); });',
      'assert.notEqual(…, null)',
      'null',
    ),
    assertPresence(
      'it("a", () => { assert.notStrictEqual(user, undefined); use(user); });',
      'assert.notStrictEqual(…, undefined)',
      'undefined',
    ),
  ],
});

tester.run('no-weak-assertion non-empty', rule, {
  valid: [
    'expect(rows).toEqual([1, 2]);',
    'expect(rows).toHaveLength(3);',
    'expect(rows.length).toBe(3);',
    'expect(rows.length).toBeGreaterThan(1);',
    'expect(rows.length).toBeGreaterThanOrEqual(2);',
    'expect(rows.length).toBeGreaterThan(count);',
    'expect(rows.length).not.toBeGreaterThan(0);',
    'expect(rows.length).not.toBe(3);',
    'expect(count).not.toBe(0);',
    'expect(rows).not.toHaveLength(2);',
    'expect(rows).toEqual([]);',
    'expect(rows).not.toEqual([1]);',
    'expect(text).not.toEqual("x");',
    'expect(rows.length > 0).toBe(false);',
    'expect(rows.length > 1).toBe(true);',
    'expect(rows.length >= 2).toBe(true);',
    'expect(rows.length > 0).not.toBe(true);',
    'expect(count > 0).toBe(true);',
    'assert.strictEqual(rows.length, 3);',
    'assert.ok(rows.length > 1);',
    'assert.ok(rows.length >= 2);',
    'assert.ok(rows.length === 0);',
    'assert.ok(rows.length < 3);',
    'assert.ok(count > 0);',
    'assert.ok(count);',
    'assert.notEqual(rows.length, 3);',
    'assert.notStrictEqual(count, 0);',
    'assert.deepStrictEqual(rows, [1]);',
    'check(rows.length > 0);',
  ],
  invalid: [
    nonEmpty('expect(rows.length).toBeGreaterThan(0);', 'expect(….length).toBeGreaterThan(0)'),
    nonEmpty('expect(rows.size).toBeGreaterThan(0);', 'expect(….size).toBeGreaterThan(0)'),
    nonEmpty(
      'expect(rows.length).toBeGreaterThanOrEqual(1);',
      'expect(….length).toBeGreaterThanOrEqual(1)',
    ),
    nonEmpty('expect(rows.length).not.toBe(0);', 'expect(….length).not.toBe(0)'),
    nonEmpty('expect(rows.length).not.toEqual(0);', 'expect(….length).not.toEqual(0)'),
    nonEmpty('expect(rows.size).not.toStrictEqual(0);', 'expect(….size).not.toStrictEqual(0)'),
    nonEmpty('expect(rows?.length).toBeGreaterThan(0);', 'expect(….length).toBeGreaterThan(0)'),
    nonEmpty(
      'expect(spy.mock.calls.length).toBeGreaterThan(0);',
      'expect(….length).toBeGreaterThan(0)',
    ),
    nonEmpty(
      'await expect(load()).resolves.not.toHaveLength(0);',
      'expect(…).resolves.not.toHaveLength(0)',
    ),
    nonEmpty('expect(rows).not.toHaveLength(0);', 'expect(…).not.toHaveLength(0)'),
    nonEmpty('expect(rows).not.toEqual([]);', 'expect(…).not.toEqual([])'),
    nonEmpty('expect(rows).not.toStrictEqual([]);', 'expect(…).not.toStrictEqual([])'),
    nonEmpty("expect(text).not.toEqual('');", "expect(…).not.toEqual('')"),
    nonEmpty('expect(text).not.toEqual(``);', 'expect(…).not.toEqual(``)'),
    nonEmpty('expect(rows.length > 0).toBe(true);', 'expect(….length > 0).toBe(true)'),
    nonEmpty('expect(rows.length >= 1).toBe(true);', 'expect(….length >= 1).toBe(true)'),
    nonEmpty('expect(rows.length > 0).toEqual(true);', 'expect(….length > 0).toEqual(true)'),
    nonEmpty('expect(0 < rows.size).toBe(true);', 'expect(0 < ….size).toBe(true)'),
    assertNonEmpty('assert.ok(rows.length > 0);', 'assert.ok(….length > 0)'),
    assertNonEmpty('assert(rows.length > 0);', 'assert(….length > 0)'),
    assertNonEmpty('assert(rows.size >= 1, "rows");', 'assert(….size >= 1)'),
    assertNonEmpty('assert.ok(rows.length !== 0);', 'assert.ok(….length !== 0)'),
    assertNonEmpty('assert.strict.ok(0 != rows.length);', 'assert.strict.ok(0 != ….length)'),
    assertNonEmpty('assert.ok(rows.length);', 'assert.ok(….length)'),
    assertNonEmpty('assert(rows.size);', 'assert(….size)'),
    assertNonEmpty('assert.notEqual(rows.length, 0);', 'assert.notEqual(….length, 0)'),
    assertNonEmpty('assert.notStrictEqual(0, rows.size);', 'assert.notStrictEqual(0, ….size)'),
  ],
});

tester.run('no-weak-assertion wildcard arguments', rule, {
  valid: [
    'expect(spy).toHaveBeenCalledWith(orderId);',
    'expect(spy).toHaveBeenCalledWith();',
    'expect(spy).toHaveBeenCalledWith(expect.anything(), 3);',
    'expect(spy).toHaveBeenCalledWith(orderId, expect.any(Number));',
    'expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));',
    'expect(spy).toHaveBeenCalledWith(...args);',
    'expect(spy).toHaveBeenCalledWith(expect.anything(), ...rest);',
    'expect(spy).not.toHaveBeenCalledWith(expect.anything());',
    'expect(spy).toHaveBeenNthCalledWith(1, orderId);',
    'expect(spy).toHaveBeenNthCalledWith(1);',
    'expect(spy).toHaveBeenNthCalledWith(expect.anything(), orderId);',
    'expect(spy).toHaveBeenCalled();',
    'expect(spy).toHaveReturnedWith(expect.anything());',
    'expect(spy).toHaveBeenCalledWith(other.anything());',
    'expect(spy).toHaveBeenCalledWith(expect.not.stringContaining("x"));',
    'spy.toHaveBeenCalledWith(expect.anything());',
  ],
  invalid: [
    wildcard(
      'expect(spy).toHaveBeenCalledWith(expect.anything());',
      'expect(…).toHaveBeenCalledWith(expect.anything())',
    ),
    wildcard(
      'expect(spy).toHaveBeenCalledWith(expect.any(String), expect.anything());',
      'expect(…).toHaveBeenCalledWith(expect.any(String), expect.anything())',
    ),
    wildcard(
      'expect(spy).toBeCalledWith(expect.any(Number));',
      'expect(…).toBeCalledWith(expect.any(Number))',
    ),
    wildcard(
      'expect(spy).toHaveBeenLastCalledWith(expect.anything());',
      'expect(…).toHaveBeenLastCalledWith(expect.anything())',
    ),
    wildcard(
      'expect(spy).lastCalledWith(expect.anything());',
      'expect(…).lastCalledWith(expect.anything())',
    ),
    wildcard(
      'expect(spy).toHaveBeenNthCalledWith(2, expect.anything());',
      'expect(…).toHaveBeenNthCalledWith(2, expect.anything())',
    ),
    wildcard(
      'expect(spy).nthCalledWith(1, expect.any(Object), expect.any(Object));',
      'expect(…).nthCalledWith(1, expect.any(Object), expect.any(Object))',
    ),
    wildcard(
      'expect(spy).toHaveBeenCalledExactlyOnceWith(expect.anything());',
      'expect(…).toHaveBeenCalledExactlyOnceWith(expect.anything())',
    ),
    wildcard(
      'expect(spy).toHaveBeenCalledOnceWith(expect.anything());',
      'expect(…).toHaveBeenCalledOnceWith(expect.anything())',
    ),
  ],
});
