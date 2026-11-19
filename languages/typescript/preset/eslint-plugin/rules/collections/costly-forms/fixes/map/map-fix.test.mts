import { afterAll } from 'vitest';
import { typedCases } from '../../../../../test-support/typed-cases.mts';
import { rule } from '../../no-costly-collection-form.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-map-fix-');
afterAll(cleanup);

const HEAD = [
  'export {};',
  'interface User { id: string; name: string; code: number; nick?: string; meta: { id: string } }',
  'interface Order { userId: string; n: number; maybe?: string; items: Order[] }',
  'declare function load(): User[];',
  'declare function use(value: unknown): void;',
  '',
].join('\n');

function lines(...rows: string[]): string {
  return `${rows.join('\n')}\n`;
}

function method(name: string, key = 'id') {
  return { messageId: 'lookupInLoop', data: { name: 'users', method: name, key } };
}

function fixes(code: string, output: string, call = 'find', key = 'id') {
  return {
    ...typed(`${HEAD}${code}`),
    errors: [
      { ...method(call, key), suggestions: [{ messageId: 'useMap', output: `${HEAD}${output}` }] },
    ],
  };
}

const BUILD = [
  '  const usersById = new Map<string, User>();',
  '  for (const u of users) {',
  '    if (!usersById.has(u.id)) {',
  '      usersById.set(u.id, u);',
  '    }',
  '  }',
];

tester.run('no-costly-collection-form map suggestion', rule, {
  valid: [],
  invalid: [
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const out = orders.map((o) => users.find((u) => u.id === o.userId)?.name);',
        '  return out;',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        ...BUILD,
        '  const out = orders.map((o) => usersById.get(o.userId)?.name);',
        '  return out;',
        '}',
      ),
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  for (const o of orders) {',
        '    use(users.find((u) => o.userId === u.id));',
        '  }',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        ...BUILD,
        '  for (const o of orders) {',
        '    use(usersById.get(o.userId));',
        '  }',
        '}',
      ),
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  return orders.map((o) => users.find((u) => u.id == o.userId));',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        ...BUILD,
        '  return orders.map((o) => usersById.get(o.userId));',
        '}',
      ),
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  for (const o of orders) {',
        '    use(users.findLast((u) => u.id === o.userId));',
        '  }',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const usersById = new Map<string, User>();',
        '  for (const u of users) {',
        '    usersById.set(u.id, u);',
        '  }',
        '  for (const o of orders) {',
        '    use(usersById.get(o.userId));',
        '  }',
        '}',
      ),
      'findLast',
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  return orders.map((o) => users.findIndex((u) => u.id === o.userId));',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const usersById = new Map<string, number>();',
        '  for (const [index, u] of users.entries()) {',
        '    if (!usersById.has(u.id)) {',
        '      usersById.set(u.id, index);',
        '    }',
        '  }',
        '  return orders.map((o) => (usersById.get(o.userId) ?? -1));',
        '}',
      ),
      'findIndex',
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  for (const o of orders) {',
        '    const at = users.findLastIndex((u) => u.id === o.userId);',
        '    use(at);',
        '  }',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const usersById = new Map<string, number>();',
        '  for (const [index, u] of users.entries()) {',
        '    usersById.set(u.id, index);',
        '  }',
        '  for (const o of orders) {',
        '    const at = usersById.get(o.userId) ?? -1;',
        '    use(at);',
        '  }',
        '}',
      ),
      'findLastIndex',
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const out: Order[] = [];',
        '  for (const o of orders) {',
        '    if (!users.some((u) => u.id === o.userId)) out.push(o);',
        '  }',
        '  return out;',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const out: Order[] = [];',
        '  const usersIdSet = new Set<string>();',
        '  for (const u of users) {',
        '    usersIdSet.add(u.id);',
        '  }',
        '  for (const o of orders) {',
        '    if (!usersIdSet.has(o.userId)) out.push(o);',
        '  }',
        '  return out;',
        '}',
      ),
      'some',
    ),
    fixes(
      lines(
        'const users = load();',
        'for (const o of orders) {',
        '  use(users.find((u) => u.name === o.userId));',
        '}',
        'declare const orders: Order[];',
      ),
      lines(
        'const users = load();',
        'const usersByName = new Map<string, User>();',
        'for (const u of users) {',
        '  if (!usersByName.has(u.name)) {',
        '    usersByName.set(u.name, u);',
        '  }',
        '}',
        'for (const o of orders) {',
        '  use(usersByName.get(o.userId));',
        '}',
        'declare const orders: Order[];',
      ),
      'find',
      'name',
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  for (const o of orders) {',
        '    for (const item of o.items) {',
        '      use(users.find((u) => u.id === item.userId));',
        '    }',
        '  }',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        ...BUILD,
        '  for (const o of orders) {',
        '    for (const item of o.items) {',
        '      use(usersById.get(item.userId));',
        '    }',
        '  }',
        '}',
      ),
    ),
    fixes(
      lines(
        'export function f(groups: { orders: Order[] }[]) {',
        '  for (const group of groups) {',
        '    const users = load();',
        '    for (const o of group.orders) {',
        '      use(users.find((u) => u.id === o.userId));',
        '    }',
        '  }',
        '}',
      ),
      lines(
        'export function f(groups: { orders: Order[] }[]) {',
        '  for (const group of groups) {',
        '    const users = load();',
        '    const usersById = new Map<string, User>();',
        '    for (const u of users) {',
        '      if (!usersById.has(u.id)) {',
        '        usersById.set(u.id, u);',
        '      }',
        '    }',
        '    for (const o of group.orders) {',
        '      use(usersById.get(o.userId));',
        '    }',
        '  }',
        '}',
      ),
    ),
    fixes(
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const usersById = 1;',
        '  return orders.map((o) => [usersById, users.find((u) => u.id === o.userId)]);',
        '}',
      ),
      lines(
        'export function f(orders: Order[]) {',
        '  const users = load();',
        '  const usersById = 1;',
        '  const usersById2 = new Map<string, User>();',
        '  for (const u of users) {',
        '    if (!usersById2.has(u.id)) {',
        '      usersById2.set(u.id, u);',
        '    }',
        '  }',
        '  return orders.map((o) => [usersById, usersById2.get(o.userId)]);',
        '}',
      ),
    ),
    fixes(
      lines(
        'class Account { id: string = ""; }',
        'declare const owners: Order[];',
        'export function f() {',
        '  const accounts: Account[] = [];',
        '  const users = accounts.slice();',
        '  return owners.map((o) => users.find((a) => a.id === o.userId));',
        '}',
      ),
      lines(
        'class Account { id: string = ""; }',
        'declare const owners: Order[];',
        'export function f() {',
        '  const accounts: Account[] = [];',
        '  const users = accounts.slice();',
        '  const usersById = new Map<string, Account>();',
        '  for (const a of users) {',
        '    if (!usersById.has(a.id)) {',
        '      usersById.set(a.id, a);',
        '    }',
        '  }',
        '  return owners.map((o) => usersById.get(o.userId));',
        '}',
      ),
    ),
  ],
});
