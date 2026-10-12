import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as noComments } from '../../typescript/preset/eslint-plugin/rules/no-comments.mjs';
import { rule as noHandwrittenBoundaryGuard } from '../../typescript/preset/eslint-plugin/rules/no-handwritten-boundary-guard.mjs';
import { rule as noUnknownInDomain } from '../../typescript/preset/eslint-plugin/rules/no-unknown-in-domain.mjs';
import { rule as reportModuleLoadEffects } from '../../typescript/preset/eslint-plugin/rules/report-module-load-effects.mjs';

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
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

const jsdocTypes = [{ jsdocTypes: true }];

tester.run('no-comments with JSDoc types', noComments, {
  valid: [
    {
      code: '/** @param {string} name */\nexport function greet(name) { return name; }',
      options: jsdocTypes,
    },
    {
      code: '/**\n * @param {string} name\n * @returns {string}\n */\nexport function greet(name) { return name; }',
      options: jsdocTypes,
    },
    { code: '/** @type {const} */\nconst names = ["a"];', options: jsdocTypes },
    { code: 'const names = /** @type {const} */ (["a"]);', options: jsdocTypes },
    { code: '/** @typedef {{ id: string }} Row */', options: jsdocTypes },
    {
      code: '/** @template T */\nexport function id(value) { return value; }',
      options: jsdocTypes,
    },
    { code: "/** @import {Row} from './row.js' */", options: jsdocTypes },
    { code: '/* istanbul ignore next */\nconst value = 1;', options: jsdocTypes },
    { code: '/** @type {Row} */\nconst row = make();', options: jsdocTypes },
    { code: 'const value = 1;', options: jsdocTypes },
  ],
  invalid: [
    {
      code: '/** Adds two numbers. */\nexport function add(a, b) { return a + b; }',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocProse' }],
    },
    {
      code: '/** @param {number} a the first operand */\nexport function inc(a) { return a + 1; }',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocProse' }],
    },
    {
      code: '/** @enum {string} */\nexport const Mode = {};',
      options: jsdocTypes,
      errors: [
        {
          messageId: 'jsdocUnsupportedTag',
          data: {
            tag: 'enum',
            allowed:
              '@param, @property, @prop, @typedef, @returns, @return, @type, @satisfies, @this, @callback, @template, @import, @overload',
          },
        },
      ],
    },
    {
      code: '/** @param name */\nexport function greet(name) { return name; }',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocMalformed', data: { usage: '@param {Type} name' } }],
    },
    {
      code: '/** @param {any} value */\nexport function keep(value) { return value; }',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocAnyType' }],
    },
    {
      code: '/** @returns {string | null} */\nexport function find() { return undefined; }',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocNullType' }],
    },
    {
      code: 'const row = /** @type {Row} */ (value);',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocCast' }],
    },
    {
      code: '/** @type {Row} */ (value).id;',
      options: jsdocTypes,
      errors: [{ messageId: 'jsdocCast' }],
    },
    {
      code: '// a line comment\nconst value = 1;',
      options: jsdocTypes,
      errors: [{ messageId: 'comment' }],
    },
    {
      code: '/* a block comment */\nconst value = 1;',
      options: jsdocTypes,
      errors: [{ messageId: 'comment' }],
    },
    {
      code: '// @ts-ignore\nconst value = 1;',
      options: jsdocTypes,
      errors: [{ messageId: 'typescriptSuppression' }],
    },
    {
      code: '/** @ts-expect-error */\nconst value = 1;',
      options: jsdocTypes,
      errors: [{ messageId: 'typescriptSuppression' }],
    },
    {
      code: '// eslint-disable-next-line no-undef\nconst value = 1;',
      options: jsdocTypes,
      errors: [{ messageId: 'eslintSuppression' }],
    },
    {
      code: '/** @param {string} name */\nfunction greet(name) { return name; }',
      errors: [{ messageId: 'internalDocComment' }],
    },
  ],
});

const jsdoc = [{ jsdoc: true }];

tester.run('no-unknown-in-domain with JSDoc types', noUnknownInDomain, {
  valid: [
    {
      code: '/** @param {string} value */\nexport function keep(value) { return value; }',
      options: jsdoc,
    },
    { code: '/** @returns {unknown} */\nexport function read() { return 1; }', options: jsdoc },
    {
      code: '/** @param {unknown} cause */\nexport function wrap(cause) { return cause; }',
      options: jsdoc,
    },
    { code: '/** @param {unknown} value */\nexport function keep(value) { return value; }' },
    {
      code: '/** @param {unknown} value */\nexport function keep(value) { return value; }',
      options: [{ jsdoc: false }],
    },
  ],
  invalid: [
    {
      code: '/** @param {unknown} value */\nexport function keep(value) { return value; }',
      options: jsdoc,
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: '/** @typedef {{ payload: unknown }} Message */',
      options: jsdoc,
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: '/**\n * @param {string} id\n * @param {Record<string, unknown>} bag\n */\nexport function keep(id, bag) { return [id, bag]; }',
      options: jsdoc,
      errors: [{ messageId: 'unknownType' }],
    },
  ],
});

tester.run('no-handwritten-boundary-guard with JSDoc types', noHandwrittenBoundaryGuard, {
  valid: [
    { code: '/** @returns {boolean} */\nexport function ok() { return true; }', options: jsdoc },
    {
      code: '/** @returns {value is string} */\nexport function isText(value) { return typeof value === "string"; }',
    },
    {
      code: '/** @returns {value is string} */\nexport function isText(value) { return typeof value === "string"; }',
      options: [{ jsdoc: false }],
    },
    { code: 'schema.parse(JSON.parse(text));', options: jsdoc },
  ],
  invalid: [
    {
      code: '/** @returns {value is string} */\nexport function isText(value) { return typeof value === "string"; }',
      options: jsdoc,
      errors: [{ messageId: 'typePredicate' }],
    },
    {
      code: '/** @return {asserts value is Row} */\nexport function assertRow(value) { return value; }',
      options: jsdoc,
      errors: [{ messageId: 'typePredicate' }],
    },
    {
      code: 'const value = JSON.parse(text);',
      options: jsdoc,
      errors: [{ messageId: 'unparsedJson' }],
    },
  ],
});

const commonJs = [{ commonJsExports: true }];

tester.run('report-module-load-effects with CommonJS exports', reportModuleLoadEffects, {
  valid: [
    { code: 'module.exports = { pad };', options: commonJs },
    { code: 'module.exports.pad = pad;', options: commonJs },
    { code: 'exports.pad = pad;', options: commonJs },
    { code: 'exports.nested.pad = pad;', options: commonJs },
  ],
  invalid: [
    { code: 'module.exports = { pad };', errors: [{ messageId: 'topLevelExpression' }] },
    {
      code: 'module.exports = { pad };',
      options: [{ commonJsExports: false }],
      errors: [{ messageId: 'topLevelExpression' }],
    },
    { code: 'exports.pad = pad;', errors: [{ messageId: 'topLevelExpression' }] },
    { code: 'module.exports();', options: commonJs, errors: [{ messageId: 'topLevelExpression' }] },
    {
      code: 'module.exports += pad;',
      options: commonJs,
      errors: [{ messageId: 'topLevelExpression' }],
    },
    {
      code: 'module.other = pad;',
      options: commonJs,
      errors: [{ messageId: 'topLevelExpression' }],
    },
    { code: 'exports = pad;', options: commonJs, errors: [{ messageId: 'topLevelExpression' }] },
    {
      code: 'registry.exports = pad;',
      options: commonJs,
      errors: [{ messageId: 'topLevelExpression' }],
    },
    { code: 'initialize();', options: commonJs, errors: [{ messageId: 'topLevelExpression' }] },
    { code: 'value = 1;', options: commonJs, errors: [{ messageId: 'topLevelExpression' }] },
  ],
});
