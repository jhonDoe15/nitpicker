import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noComments } from './rules/modules/no-comments.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
  },
});

ruleTester.run('no-comments', noComments, {
  valid: [
    { code: '/** Parses a date. */\nexport function parse(text: string) { return text; }' },
    { code: '/** The default port. */\nexport const port = 80;' },
    { code: '/** Reads the config. */\nexport default function read() { return 1; }' },
    {
      code: '/** A signed-in user. */\nexport type User = {\n  /** Shown in the header, at most 40 characters. */\n  name: string;\n};',
    },
    ...[
      '/** Price in cents, rounded down. */\nexport const priceCents = 1;',
      '/** Retries up to three times, then throws ApiError. */\nexport function fetchUser() { return 1; }',
      '/**\n * Gets the user name.\n * Falls back to the email when no name is set.\n */\nexport function getUserName() { return 1; }',
      '/** @param id the order id */\nexport function loadOrder(id: string) { return id; }',
      '/** @deprecated */\nexport function getUserName() { return 1; }',
      '/** */\nexport function getUserName() { return 1; }',
      '/** Gets the user name. */\nexport { getUserName };',
      '/** Gets the user name. */\nexport const { getUserName } = names;',
      '/** Gets the user name. */\nexport default function () { return 1; }',
      '/** Reads the user name. */\nexport function getUserName() { return 1; }',
      '/** Pending orders. */\nexport type Orders = {\n  /** Seconds before the entry expires. */\n  ttl: number;\n};',
      '/**\n * Rounds toward zero.\n * Never returns negative zero.\n * Accepts only finite numbers.\n * Throws RangeError otherwise.\n * Safe to call often.\n */\nexport function truncate() { return 1; }',
      '/**\n * One.\n *\n * Two.\n *\n * Three.\n * Four.\n * Five.\n */\nexport function truncate() { return 1; }',
      '/**\n * Rounds toward zero.\n * @example\n * truncate(1.5);\n * truncate(-1.5);\n * truncate(2);\n * truncate(3);\n * truncate(4);\n * @param value any number\n */\nexport function truncate(value: number) { return value; }',
      '/** Rounds toward zero. */\nexport type Rounding = {\n  /**\n   * Digits kept.\n   * Zero keeps none.\n   * Negative counts left of the point.\n   * Capped at 20.\n   * Fractions are floored.\n   */\n  digits: number;\n};',
      '/**\n * Rounds toward zero.\n * ```ts\n * truncate(1.5);\n * truncate(-1.5);\n * truncate(2);\n * truncate(3);\n * ```\n * Safe to call often.\n * @returns the integer part\n */\nexport const truncate = 1;',
    ].map((code) => ({ code })),
    { code: '/** @jsxImportSource preact */\nexport const a = 1;' },
    { code: '/* eslint no-console: off */\nexport const a = 1;' },
  ],
  invalid: [
    {
      code: '/** Gets the user name. */\nexport function getUserName() { return 1; }',
      options: [{ jsdocTypes: true }],
      errors: [{ messageId: 'jsdocProse' }],
    },
    {
      code: '/** Parses a date. */\nfunction parse(text: string) { return text; }',
      errors: [{ messageId: 'internalDocComment' }],
    },
    {
      code: 'export function parse(text: string) {\n  /** Trim first. */\n  return text.trim();\n}',
      errors: [{ messageId: 'internalDocComment' }],
    },
    {
      code: 'type User = {\n  /** Display name. */\n  name: string;\n};',
      errors: [{ messageId: 'internalDocComment' }],
    },
    { code: '/** Trailing doc. */', errors: [{ messageId: 'internalDocComment' }] },
    ...[
      ['/** Gets the user name. */\nexport function getUserName() { return 1; }', 'getUserName'],
      ['/** Button component */\nexport function Button() { return 1; }', 'Button'],
      ['/** Returns the order total. */\nexport const orderTotal = 1;', 'orderTotal'],
      ['/** Creates a new user. */\nexport function createUser() { return 1; }', 'createUser'],
      ['/** Deleted orders */\nexport type DeleteOrder = string;', 'DeleteOrder'],
      ['/** Is the user active? */\nexport function isUserActive() { return 1; }', 'isUserActive'],
      ['/** The max retry count. */\nexport const MAX_RETRY_COUNT = 3;', 'MAX_RETRY_COUNT'],
      [
        '/** Fetches the user-profile. */\nexport function fetchUserProfile() { return 1; }',
        'fetchUserProfile',
      ],
      ['/** Parse the v2 url */\nexport function parseV2Url() { return 1; }', 'parseV2Url'],
      [
        '/**\n * Gets the user name.\n * @param id the account\n * @returns something else entirely\n */\nexport function getUserName(id: string) { return id; }',
        'getUserName',
      ],
      ['/** The {@link User} record. */\nexport type UserRecord = string;', 'UserRecord'],
      ['/** Order id. */\nexport default function orderId() { return 1; }', 'orderId'],
      ['/** Order id. */\nexport class OrderId {}', 'OrderId'],
      ['/** The user. */\nexport interface User {}', 'User'],
      ['/** Order class. */\nexport class Order {}', 'Order'],
    ].map(([code, name]) => ({
      code,
      errors: [{ messageId: 'restatingDocComment', data: { name } }],
    })),
    {
      code: '/**\n * Rounds toward zero.\n * Never returns negative zero.\n * Accepts only finite numbers.\n * Throws RangeError otherwise.\n * Safe to call often.\n * Runs in constant time.\n */\nexport function truncate() { return 1; }',
      errors: [{ messageId: 'longDocComment', data: { lines: 6, limit: 5 } }],
    },
    {
      code: '/** Rounds toward zero. */\nexport type Rounding = {\n  /**\n   * Digits kept.\n   * Zero keeps none.\n   * Negative counts left of the point.\n   * Capped at 20.\n   * Fractions are floored.\n   * Default is two.\n   */\n  digits: number;\n};',
      errors: [{ messageId: 'longDocComment', data: { lines: 6, limit: 5 } }],
    },
    {
      code: '/** Rounds toward zero.\n * Never returns negative zero.\n * Accepts only finite numbers.\n * Throws RangeError otherwise.\n * Safe to call often.\n * Constant time.\n * @param value a number */\nexport const truncate = 1;',
      errors: [{ messageId: 'longDocComment', data: { lines: 6, limit: 5 } }],
    },
    ...[
      '/**\n * Rounds toward zero.\n * Never returns negative zero.\n * @scope/numbers rounds the same way.\n * Accepts only finite numbers.\n * Throws RangeError otherwise.\n * Safe to call often.\n * @param value a number\n */\nexport const truncate = 1;',
      '/**\n * Rounds toward zero.\n * ```ts\n * truncate(1.5);\n * truncate(-1.5);\n * truncate(2);\n * truncate(3);\n * @returns the integer part\n */\nexport const truncate = 1;',
      '/**\n * Rounds toward zero.\n * ```ts\n * @Component()\n * class Rounder {}\n * ```\n * Safe to call often.\n * Never returns negative zero.\n * Accepts only finite numbers.\n * Throws RangeError otherwise.\n * Runs in constant time.\n * @returns the integer part\n */\nexport const truncate = 1;',
    ].map((code) => ({
      code,
      errors: [{ messageId: 'longDocComment', data: { lines: 6, limit: 5 } }],
    })),
    {
      code: 'export type Order = {\n  /** The order id */\n  orderId: string;\n  /** Gets the total. */\n  getTotal(): number;\n  /** Shown in the header. */\n  title: string;\n};',
      errors: [
        { messageId: 'restatingDocComment', data: { name: 'orderId' } },
        { messageId: 'restatingDocComment', data: { name: 'getTotal' } },
      ],
    },
    {
      code: '// Parses a date.\nexport function parse() { return 1; }',
      errors: [{ messageId: 'comment' }],
    },
    {
      code: '/* Parses a date. */\nexport function parse() { return 1; }',
      errors: [{ messageId: 'comment' }],
    },
    {
      code: '/** @ts-ignore */\nexport const a = 1;',
      errors: [{ messageId: 'typescriptSuppression' }],
    },
    ...[
      ['/* istanbul ignore next */', 'istanbul ignore'],
      ['/* c8 ignore start */', 'c8 ignore'],
      ['/* v8 ignore next */', 'v8 ignore'],
      ['// Stryker disable next-line all', 'Stryker disable'],
      ['// stryker restore all', 'stryker restore'],
      ['/* istanbul  ignore\tnext */', 'istanbul ignore'],
      ['/** istanbul ignore next */', 'istanbul ignore'],
      ['/**\n * c8 ignore next\n */', 'c8 ignore'],
    ].map(([comment, directive]) => ({
      code: `${comment}\nexport const a = 1;`,
      errors: [{ messageId: 'coverageSuppression', data: { directive } }],
    })),
    {
      code: 'export type T = {\n  /** v8 ignore next */\n  a: number;\n};',
      errors: [{ messageId: 'coverageSuppression', data: { directive: 'v8 ignore' } }],
    },
    {
      code: 'export const a = 1; // istanbul ignore next',
      errors: [{ messageId: 'coverageSuppression', data: { directive: 'istanbul ignore' } }],
    },
  ],
});

const suppressionsOnly = [{ suppressionsOnly: true }];

ruleTester.run('no-comments, suppression comments only', noComments, {
  valid: [
    { code: "// the order matters here\nit('x', () => {});", options: suppressionsOnly },
    { code: '/** Builds a user. */\nfunction build() { return 1; }', options: suppressionsOnly },
    { code: '// @jsxImportSource preact\nexport const a = 1;', options: suppressionsOnly },
  ],
  invalid: [
    {
      code: '// @ts-expect-error wrong on purpose\nrun(1);',
      options: suppressionsOnly,
      errors: [{ messageId: 'typescriptSuppression' }],
    },
    {
      code: '// Stryker disable all\nexport const a = 1;',
      options: suppressionsOnly,
      errors: [{ messageId: 'coverageSuppression' }],
    },
    {
      code: 'run(); /* v8 ignore next */',
      options: suppressionsOnly,
      errors: [{ messageId: 'coverageSuppression' }],
    },
  ],
});
