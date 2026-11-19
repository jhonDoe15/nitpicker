import { afterAll } from 'vitest';
import { typedCases } from '../../../../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../../../../test-support/rule-tester.mts';
import { rule } from '../../no-costly-collection-form.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-map-declines-');
afterAll(cleanup);

const HEAD = [
  'export {};',
  'interface User { id: string; name: string; code: number; nick?: string; meta: { id: string } }',
  'interface Admin { id: string; level: number }',
  'interface Order { userId: string; n: number; maybe?: string; items: Order[] }',
  'declare function load(): User[];',
  'declare function loadNullable(): (User | null)[];',
  'declare function loadMixed(): (User | Admin)[];',
  'declare function loadMaybe(): User[] | undefined;',
  'declare function loadPair(): [User, User];',
  'declare function loadLoose(): any[];',
  'declare function makeId(order: Order): string;',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

function lines(...rows: string[]): string {
  return `${rows.join('\n')}\n`;
}

function declines(code: string, call = 'find', key = 'id') {
  return {
    ...typed(`${HEAD}${code}`),
    errors: [{ messageId: 'lookupInLoop', data: { name: 'users', method: call, key } }],
  };
}

function lookup(declaration: string, expression: string, call = 'find', key = 'id') {
  return declines(
    lines(
      'export function f(orders: Order[]) {',
      `  ${declaration}`,
      `  return orders.map((o) => ${expression});`,
      '}',
    ),
    call,
    key,
  );
}

const FIND = 'users.find((u) => u.id === o.userId)';
const LOAD = 'const users = load();';

tester.run('no-costly-collection-form map suggestion declines', rule, {
  valid: [],
  invalid: [
    lookup(LOAD, 'users.find((u) => u.code === o.n)', 'find', 'code'),
    lookup(LOAD, 'users.find((u) => u.id === o.maybe)'),
    lookup(LOAD, 'users.find((u) => u.nick === o.userId)', 'find', 'nick'),
    lookup(LOAD, 'users.find((u) => u.id === makeId(o))'),
    lookup(LOAD, 'users.find((u) => u.id === String(o.n))'),
    lookup(LOAD, 'users.find((u) => u.meta.id === o.userId)', 'find', 'meta.id'),
    lookup(LOAD, 'users.find(function (u) { return u.id === o.userId; })'),
    lookup(LOAD, 'users.find((u, i) => u.id === o.userId)'),
    lookup(LOAD, 'users.findIndex((u) => u.code === o.n)', 'findIndex', 'code'),
    lookup(LOAD, 'users.some((u) => u.code === o.n)', 'some', 'code'),
    lookup('const users = loadNullable();', 'users.find((u) => u.id === o.userId)'),
    lookup('const users = loadMixed();', 'users.find((u) => u.id === o.userId)'),
    lookup('const users = loadMaybe();', 'users?.find((u) => u.id === o.userId)'),
    lookup('const users = loadPair();', 'users.find((u) => u.id === o.userId)'),
    lookup('const users = loadLoose();', 'users.find((u) => u.id === o.userId)'),
    lookup('let users = load();', FIND),
    lookup('const users = load();', '(users as User[]).find((u) => u.id === o.userId)'),
    lookup(LOAD, 'users.find(/* by id */ (u) => u.id === o.userId)'),
    lookup('const Map = 1; const users = load();', FIND),
    declines(
      lines(
        'export function f(users: User[], orders: Order[]) {',
        '  return orders.map((o) => users.find((u) => u.id === o.userId));',
        '}',
      ),
    ),
    declines(
      lines(
        'export const users = load();',
        'export function f(orders: Order[]) {',
        '  return orders.map((o) => users.find((u) => u.id === o.userId));',
        '}',
      ),
    ),
    declines(
      lines(
        'const users = load();',
        'export const f = (orders: Order[]) => orders.map((o) => users.find((u) => u.id === o.userId));',
      ),
    ),
    declines(
      'export function f(orders: Order[]) { const users = load(); return orders.map((o) => users.find((u) => u.id === o.userId)); }\n',
    ),
    declines(
      lines(
        'class Account { get id(): string { return ""; } }',
        'declare function loadAccounts(): Account[];',
        'export function f(orders: Order[]) {',
        '  const users = loadAccounts();',
        '  return orders.map((o) => users.find((a) => a.id === o.userId));',
        '}',
      ),
    ),
    declines(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  for (const o of orders) {',
        '    const user = users.find((u) => u.id === o.userId);',
        '    if (user) user.id = makeId(o);',
        '  }',
        '}',
      ),
    ),
    declines(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  Object.assign(users[0], { id: "x" });',
        '  return orders.map((o) => users.find((u) => u.id === o.userId));',
        '}',
      ),
    ),
    {
      ...typed(
        `${HEAD}${lines(
          'export class Directory {',
          '  private users = load();',
          '  run(orders: Order[]) {',
          '    return orders.map((o) => this.users.find((u) => u.id === o.userId));',
          '  }',
          '}',
        )}`,
      ),
      errors: [
        { messageId: 'lookupInLoop', data: { name: 'this.users', method: 'find', key: 'id' } },
      ],
    },
  ],
});

typescriptRuleTester().run('no-costly-collection-form map suggestion without types', rule, {
  valid: [],
  invalid: [
    {
      code: lines(
        'export function f(orders) {',
        '  const users = load();',
        '  return orders.map((o) => users.find((u) => u.id === o.userId));',
        '}',
      ),
      errors: [{ messageId: 'lookupInLoop' }],
    },
  ],
});
