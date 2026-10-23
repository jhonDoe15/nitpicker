import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-compatibility-shim.mjs';

const tester = typescriptRuleTester();

function alias(code, aliasName, target) {
  return { code, errors: [{ messageId: 'aliasExport', data: { alias: aliasName, target } }] };
}

tester.run('no-compatibility-shim', rule, {
  valid: [
    'export function fetchUser() { return 1; }',
    '/** The user id. */\nexport function fetchUser() { return 1; }',
    'function load() { return 1; }\nexport const fetchUser = load;',
    'function load() { return 1; }\nexport { load as fetchUser };',
    'export function load() { return 1; }\nexport const fetchUser = other;',
    'import { load } from "./load";\nexport const fetchUser = load;',
    'export type User = { id: string };\nexport type Entity<T> = User;',
    'export type User = { id: string };\nexport type Entity = Array<User>;',
    'type Raw = { id: string };\nexport type User = Raw;',
    'export const limit = 3;\nexport const retries = 3;',
    {
      code: '/** @deprecated use load */\nexport function fetchUser() { return 1; }',
      options: [{ jsdoc: true }],
    },
    '// deprecated\nexport function fetchUser() { return 1; }',
  ],
  invalid: [
    {
      code: '/** @deprecated use load */\nexport function fetchUser() { return 1; }',
      errors: [{ messageId: 'deprecatedTag' }],
    },
    {
      code: '/**\n * Loads a user.\n * @deprecated\n */\nexport function fetchUser() { return 1; }',
      errors: [{ messageId: 'deprecatedTag' }],
    },
    alias(
      'export function load() { return 1; }\nexport const fetchUser = load;',
      'fetchUser',
      'load',
    ),
    alias('export class Loader {}\nexport const OldLoader = Loader;', 'OldLoader', 'Loader'),
    alias('export type User = { id: string };\nexport type Account = User;', 'Account', 'User'),
    alias(
      'function load() { return 1; }\nexport { load };\nexport const fetchUser = load;',
      'fetchUser',
      'load',
    ),
  ],
});
