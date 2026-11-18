import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/collections/pipelines/no-wasted-collection-step.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-find-boolean-', { lib: ['ES2023'] });
afterAll(cleanup);
const untyped = typescriptRuleTester();

const PRE = `export {}; interface User { id: number; ok: boolean } class Item { v = 1; }
declare const users: User[]; declare const ro: readonly User[]; declare const pair: [User, User];
declare const items: Item[]; declare const fns: (() => void)[]; declare const maybe: User[] | undefined;
declare const holder: { list: User[] }; declare const objs: object[];
declare const strs: string[]; declare const nums: number[]; declare const bools: boolean[];
declare const maybeUsers: (User | undefined)[]; declare const nullable: (User | null)[];
declare const mixed: (User | string)[]; declare const empties: {}[]; declare const anything: any;
declare const unknowns: unknown[]; declare const lits: ('a' | 'b')[]; declare const sym: symbol[];
declare class List<T> { find(test: (item: T) => boolean): T | undefined; }
declare const list: List<User>; declare function generic<T>(values: T[]): boolean;
declare let hits: number;`;

const found = [{ messageId: 'findAsBoolean' }];
const CB = '(u) => u.id === 1';

function program(expression: string) {
  return `${PRE} export function run(): unknown { return ${expression}; }`;
}

function fixes(before: string, after: string) {
  return { ...typed(program(before), found), output: program(after) };
}

function declines(before: string) {
  return { ...typed(program(before), found), output: null };
}

const forms: [string, string][] = [
  [`!users.find(${CB})`, `!users.some(${CB})`],
  [`!!users.find(${CB})`, `!!users.some(${CB})`],
  [`Boolean(users.find(${CB}))`, `Boolean(users.some(${CB}))`],
  [`users.find(${CB}) ? 1 : 2`, `users.some(${CB}) ? 1 : 2`],
  [`users.find(${CB}) !== undefined`, `users.some(${CB})`],
  [`users.find(${CB}) != undefined`, `users.some(${CB})`],
  [`users.find(${CB}) != null`, `users.some(${CB})`],
  [`users.find(${CB}) === undefined`, `!users.some(${CB})`],
  [`users.find(${CB}) == undefined`, `!users.some(${CB})`],
  [`users.find(${CB}) == null`, `!users.some(${CB})`],
  [`undefined !== users.find(${CB})`, `users.some(${CB})`],
  [`null != users.find(${CB})`, `users.some(${CB})`],
  [`undefined === users.find(${CB})`, `!users.some(${CB})`],
  [`null == users.find(${CB})`, `!users.some(${CB})`],
  [`(users.find(${CB})) !== undefined`, `(users.some(${CB}))`],
  [`(users.find(${CB})) === undefined`, `!(users.some(${CB}))`],
  [`!(users.find(${CB}) === undefined)`, `!(!users.some(${CB}))`],
  [`users.find(${CB}) === undefined ? 1 : 2`, `!users.some(${CB}) ? 1 : 2`],
  [`hits > 0 && users.find(${CB}) !== undefined`, `hits > 0 && users.some(${CB})`],
  [`!maybe?.find(${CB})`, `!maybe?.some(${CB})`],
  [`!holder.list.find(${CB})`, `!holder.list.some(${CB})`],
  [`!ro.find(${CB})`, `!ro.some(${CB})`],
  [`!pair.find(${CB})`, `!pair.some(${CB})`],
  [`!items.find((i) => i.v > 1)`, `!items.some((i) => i.v > 1)`],
  [`!fns.find((f) => f.length === 0)`, `!fns.some((f) => f.length === 0)`],
  [`!objs.find((o) => o === users)`, `!objs.some((o) => o === users)`],
  [`!users.filter((u) => u.ok).find(${CB})`, `!users.filter((u) => u.ok).some(${CB})`],
  [
    '!users.find((u) => { hits += 1; return u.ok; })',
    '!users.some((u) => { hits += 1; return u.ok; })',
  ],
  ['!users.find(function (u) { return u.ok; })', '!users.some(function (u) { return u.ok; })'],
  [`users\n    .find(${CB}) !== undefined`, `users\n    .some(${CB})`],
];

const unproven = [
  'strs',
  'nums',
  'bools',
  'maybeUsers',
  'nullable',
  'mixed',
  'empties',
  'anything',
  'unknowns',
  'lits',
  'sym',
  'list',
];

tester.run('find as boolean fix', rule, {
  valid: [
    typed(program(`users.find(${CB})`)),
    typed(program(`users.find(${CB}) === users[0]`)),
    typed(program(`users.find(${CB}, hits) !== undefined`)),
    typed(program('users.find(isOk) !== undefined')),
    typed(program(`users.some(${CB})`)),
    typed(program(`users.find(${CB}) === void 0`)),
  ],
  invalid: [
    ...forms.map(([before, after]) => fixes(before, after)),
    ...unproven.map((name) => declines(`!${name}.find((u) => u)`)),
    ...unproven.map((name) => declines(`${name}.find((u) => u) !== undefined`)),
    declines(`users.find<User>(${CB}) !== undefined`),
    declines(`!new Array<User>(3).find(${CB})`),
    declines(`!Array<User>(3).find(${CB})`),
    declines(`!(new Array<User>(3)).filter(${CB}).find(${CB})`),
    declines(`new Array<User>(users.length).find(${CB}) !== undefined`),
    fixes(
      `!Array.from({ length: 3 }, () => users[0]!).find(${CB})`,
      `!Array.from({ length: 3 }, () => users[0]!).some(${CB})`,
    ),
    fixes(`!new Array<User>(...users).find(${CB})`, `!new Array<User>(...users).some(${CB})`),
    declines(`users.find(${CB}) /* none */ !== undefined`),
    declines(`users.find(${CB}) !== /* none */ undefined`),
    declines(`undefined /* none */ !== users.find(${CB})`),
    declines(`maybe?.find(${CB}) !== undefined`),
    declines(`maybe?.find(${CB}) === undefined`),
    declines(`users.find(${CB}) === null`),
    declines(`users.find(${CB}) !== null`),
    declines(`!(users.find(${CB}) as User)`),
    declines(`!users.find(${CB})!`),
  ],
});

const shadowed = (head: string, body: string) =>
  `${PRE} export function run(${head}: any): unknown { return ${body}; }`;

tester.run('find as boolean fix with shadowed names', rule, {
  valid: [],
  invalid: [
    ['undefined', `users.find(${CB}) !== undefined`],
    ['Boolean', `Boolean(users.find(${CB}))`],
  ].map(([head = '', body = '']) => ({ ...typed(shadowed(head, body), found), output: null })),
});

const script = '/repo/src/main/features/billing/domain/totals.ts';

untyped.run('find as boolean fix without types', rule, {
  valid: [],
  invalid: [
    'const has = !users.find((u) => u.ok);',
    'const has = users.find((u) => u.ok) !== undefined;',
    'if (users.find((u) => u.ok)) { run(); }',
  ].flatMap((code) => [
    { filename: script, code, errors: found, output: null },
    { filename: script.replace('.ts', '.mjs'), code, errors: found, output: null },
  ]),
});
