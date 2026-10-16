import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-forwarding-wrapper.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-forwarding-wrapper-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      jsx: 'preserve',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));
writeFileSync(
  path.join(root, 'src/api.ts'),
  [
    'export type User = { id: string };',
    "export type UserId = string & { readonly brand: 'UserId' };",
    'export declare function fetchUser(id: string): User;',
    'export declare function fetchUsers(...ids: string[]): User[];',
    'export type Options = { deep: boolean };',
    'export declare function findUser(id: string, options: Options): User;',
    'export declare function fetchWith(id: string, retry?: number): User;',
    'export declare function fetchRetry(id: string, retry: number | undefined): User;',
    'export type Foo = { a: string };',
    'export declare function isObject(value: unknown): boolean;',
    'export declare function assertOk(value: unknown): void;',
    'export declare function useQuery(key: string): User;',
    'export declare function pick<T>(value: T): T;',
    'export declare function overloaded(id: string | number): User;',
    'export declare const api: { fetchUser(id: string): User };',
    '',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

let counter = 0;

function typed(code, errors) {
  counter += 1;
  const file = path.join(root, `src/case-${String(counter)}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

const imports =
  "import { api, assertOk, fetchRetry, fetchUser, fetchUsers, fetchWith, findUser, isObject, overloaded, pick, useQuery } from './api';\nimport type { Foo, Options, User, UserId } from './api';\n";

function wrapper(name, target, exported = name) {
  return [{ messageId: 'forwardingWrapper', data: { name, target, exported } }];
}

function local(name, target) {
  return [{ messageId: 'forwardingWrapperLocal', data: { name, target } }];
}

tester.run('no-forwarding-wrapper', rule, {
  valid: [
    'export function loadUser(id: string) { return fetchUser(id, true); }',
    'export function loadUser(id: string) { return fetchUser(); }',
    'export function loadUser(id: string) { return fetchUser(id, id); }',
    'export function swap(a: Options, b: string) { return findUser(b, a); }',
    'export function loadUser() { return fetchUser(); }',
    'export function loadUser(id: string) { const user = fetchUser(id); return user; }',
    'export function loadUser(id: string) { log(id); return fetchUser(id); }',
    'export function loadUser(id: string) { fetchUser(id); }',
    'export function loadUser(id: string) {}',
    'export function loadUser(id: string) { return id; }',
    'export function loadUser(id: string) { return fetchUser(id).id; }',
    'export const loadUser = (id: string) => fetchUser(id).id;',
    'export async function loadUser(id: string) { return fetchUser(id); }',
    'export function* loadUsers(id: string) { return fetchUsers(id); }',
    'export function loadUser<T extends string>(id: T) { return fetchUser(id); }',
    'export function loadUser(id: string) { return pick<string>(id); }',
    'export function loadUser(id: string) { return pick(id); }',
    'export const loadUser = (id: string) => pick<string>(id);',
    'class Users { load(id: string) { return fetchUser(id); } }',
    'export const users = { load(id: string) { return fetchUser(id); } };',
    'export const users = { load: (id: string) => fetchUser(id) };',
    'export function load(id: string) { return api.fetchUser(id); }',
    'export const abs = (value: number) => Math.abs(value);',
    'export const parse = (text: string) => JSON.parse(text);',
    'export const decode = (text: string) => decodeURIComponent(text);',
    'export function load(id: string) { return fetchUser?.(id); }',
    'export function again(run: (value: unknown) => void) { return run(run); }',
    'export function loadUser(...ids: string[]) { return fetchUsers(ids); }',
    'export function loadUser(id = "1") { return fetchUser(id); }',
    'export function loadUser({ id }: { id: string }) { return fetchUser(id); }',
    'export function loadUser(id: string) { return fetchUser(id.trim()); }',
    'export function loadUser(id: string) { return make()(id); }',
    'export function loadUser(id: string) { return new Map([[id, id]]); }',
    'export const loadUser: (id: string) => User = (id) => fetchUser(id);',
    'export function Panel(props: string) { return fetchUser(props); }',
    'export const Panel = (props: string) => fetchUser(props);',
    'export function loadUser(id: string): User { return loadUser(id); }',
    'export default function (id: string) { return fetchUser(id); }',
    'export const loadUser = fetchUser;',
    'export const loadUser = (id: string) => `${id}`;',
    'export const loadUser = (id: string) => (id ? fetchUser(id) : undefined);',
    'export function loadUser(id: UserId) { return fetchUser(id); }',
    'export function loadUser(id: string): User | undefined { return fetchUser(id); }',
    'export function loadUser(id: "a" | "b") { return fetchUser(id); }',
    'export function loadUser(id: string) { return fetchWith(id); }',
    'export function loadUser(id: string, options: Options & { extra?: number }) { return findUser(id, options); }',
    'export function make(fetch: (id: string) => User) { return function load(id: string) { return fetch(id); }; }',
    'export function make(fetch: (id: string) => User) { return (id: string) => fetch(id); }',
    'export function Panel() { const load = (id: string) => fetchUser(id); return load("1"); }',
    'export function Panel() { function load(id: string) { return fetchUser(id); } return load("1"); }',
    'export function useUser(key: string) { const q = (k: string) => useQuery(k); return q(key); }',
    'export function loadUser(fetchUser: (id: string) => User) { return (id: string) => fetchUser(id); }',
    'export function loadUser(fetcher: (id: string) => User, id: string) { return fetcher(id); }',
    'export function isFoo(value: unknown): value is Foo { return isObject(value); }',
    'export const isFoo = (value: unknown): value is Foo => isObject(value);',
    'export function assertFoo(value: unknown): asserts value is Foo { return assertOk(value); }',
    'export function loadUser(id: string, retry?: number) { return fetchRetry(id, retry); }',
    'export function loadUser(id: string, retry: number | undefined) { return fetchWith(id, retry); }',
    'export function over(id: string): User;\nexport function over(id: number): User;\nexport function over(id: string | number): User { return overloaded(id); }',
  ].map((code) => typed(`${imports}${code}`)),
  invalid: [
    typed(
      `${imports}export function loadUser(id: string) { return fetchUser(id); }`,
      wrapper('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}export function loadUser(id: string): User { return fetchUser(id); }`,
      wrapper('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}function loadUser(id: string) { return fetchUser(id); }`,
      local('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}export const loadUser = (id: string) => fetchUser(id);`,
      wrapper('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}export const loadUser = (id: string) => { return fetchUser(id); };`,
      wrapper('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}export const loadUser = function (id: string) { return fetchUser(id); };`,
      wrapper('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}const loadUser = (id: string) => fetchUser(id);`,
      local('loadUser', 'fetchUser'),
    ),
    typed(
      `${imports}export function loadUser(id: string, options: Options) { return findUser(id, options); }`,
      wrapper('loadUser', 'findUser'),
    ),
    typed(
      `${imports}export function loadUsers(...ids: string[]) { return fetchUsers(...ids); }`,
      wrapper('loadUsers', 'fetchUsers'),
    ),
    typed(
      `${imports}export function useUser(key: string) { return useQuery(key); }`,
      wrapper('useUser', 'useQuery'),
    ),
    typed(
      "import { fetchUser as original } from './api';\nexport const loadUser = (id: string) => original(id);",
      wrapper('loadUser', 'original'),
    ),
    typed(
      "export { fetchUser } from './api';\nimport { fetchUser } from './api';\nexport function load(id: string) { return fetchUser(id); }",
      wrapper('load', 'fetchUser'),
    ),
    typed(
      `${imports}export function loadUser(id: string, retry?: number) { return fetchWith(id, retry); }`,
      wrapper('loadUser', 'fetchWith'),
    ),
    typed(
      `${imports}export default function loadUser(id: string) { return fetchUser(id); }`,
      wrapper('loadUser', 'fetchUser', 'default'),
    ),
    typed(
      `${imports}const loadUser = (id: string) => fetchUser(id);\nexport default loadUser;`,
      wrapper('loadUser', 'fetchUser', 'default'),
    ),
    typed(
      `${imports}function loadUser(id: string) { return fetchUser(id); }\nexport { loadUser as load };`,
      wrapper('loadUser', 'fetchUser', 'load'),
    ),
    typed(
      'function lookup(id: string) { return { id }; }\nexport const find = (id: string) => lookup(id);',
      wrapper('find', 'lookup'),
    ),
  ],
});
