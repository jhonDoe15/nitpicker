import path from 'node:path';
import { useTemporaryProjects } from '../../../../test-support/temporary-projects.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../no-sequential-independent-reads.mts';

const ORMS = [{ orms: ['prisma'], opensTransactions: false }];
const projects = useTemporaryProjects('nitpicker-project-reads-', { keepForFile: true });
const root = projects.projectWith({
  'package.json': '{"name":"shop"}',
  'src/users.ts': [
    'export async function getUser(id: string) {',
    '  return prisma.user.findUnique({ where: { id } });',
    '}',
    'export const listOrders = async (userId: string) => {',
    '  const rows = await prisma.order.findMany({ where: { userId } });',
    '  return rows.map((row) => ({ ...row, total: Math.round(row.total) }));',
    '};',
    'export async function loadProfile(id: string) {',
    "  const res = await fetch('/api/profiles/' + id);",
    '  return res.json();',
    '}',
    'export async function touchUser(id: string) {',
    '  const user = await prisma.user.findUnique({ where: { id } });',
    '  await prisma.user.update({ where: { id }, data: { seenAt: new Date() } });',
    '  return user;',
    '}',
    'export async function cachedUser(id: string) {',
    '  const user = await prisma.user.findUnique({ where: { id } });',
    '  cache.set(id, user);',
    '  return user;',
    '}',
    'export async function auditedOrders(id: string) {',
    '  const rows = await prisma.order.findMany({ where: { id } });',
    '  rows.forEach((row) => prisma.audit.create({ data: { row } }));',
    '  return rows;',
    '}',
    'export async function loadInto(ctx: { id: string; user?: unknown }) {',
    '  ctx.user = await prisma.user.findUnique({ where: { id: ctx.id } });',
    '  return ctx.user;',
    '}',
    'export async function keysOf(id: string) {',
    '  const row = await prisma.user.findUnique({ where: { id } });',
    '  Object.assign(shared, row);',
    '  return row;',
    '}',
    'export async function readJson(id: string) {',
    "  const res = await fetch('/api/json/' + id);",
    '  const body = await res.json();',
    '  return body;',
    '}',
    'export async function destructured(id: string) {',
    '  const [first, , { name, ...others }, ...tail] = [1, 2, { name: id }, 3];',
    '  const { picked = 1 } = { picked: 2 };',
    '  let count = 0;',
    '  count++;',
    '  const row = await prisma.user.findUnique({ where: { id } });',
    '  return !row && [first, name, others, tail, picked, count].length;',
    '}',
    'export async function deleter(id: string) {',
    '  const row = await prisma.user.findUnique({ where: { id } });',
    '  delete cache[id];',
    '  return row;',
    '}',
    'export async function getTeam(id: string) {',
    '  const team = await prisma.team.findFirst({ where: { id } });',
    "  if (!team) throw new Error('not found');",
    '  return team;',
    '}',
    'let lastId = "";',
    'export async function rememberUser(id: string) {',
    '  lastId = id;',
    '  return prisma.user.findUnique({ where: { id } });',
    '}',
  ].join('\n'),
  'src/lists.ts': [
    "import type { Row } from './types';",
    "import unused, * as everything from './users';",
    "import { getUser as aliasedUser, listOrders as orderList } from './users';",
    'type Shape = { id: string };',
    'const readOrders = async (userId: string) => prisma.order.findMany({ where: { userId } });',
    'async function readTeam(id: string) {',
    '  return prisma.team.findFirst({ where: { id } });',
    '}',
    'export let mutable = async (id: string) => prisma.user.findUnique({ where: { id } });',
    'export { readOrders, readTeam as team, aliasedUser as again, orderList };',
    "export { loadProfile as profile } from './users';",
    'export type { Shape as ShapeAlias };',
    'export default readOrders;',
  ].join('\n'),
  'src/defaults.ts':
    'export default async function (id: string) { return prisma.user.findUnique({ where: { id } }); }',
  'src/late.ts':
    'export const early = 1;\nfunction late(id: string) { return prisma.user.findUnique({ where: { id } }); }\nexport { late };',
  'src/constant.ts': 'export default 5;',
  'src/nodefault.ts': 'export const one = 1;',
  'src/forwarding.ts': "import { getUser } from './users';\nexport default getUser;",
  'src/data.json': '{"a":1}',
  'src/index.ts': "export { getUser as findUser, listOrders } from './users';",
});
const filename = path.join(root, 'src/page.ts');
const NAMES =
  'getUser, listOrders, loadProfile, touchUser, cachedUser, auditedOrders, rememberUser, getTeam, loadInto, keysOf, readJson, destructured, deleter';
const IMPORTS = `import { ${NAMES} } from './users';`;

function inPage(body: string, head = IMPORTS) {
  return {
    filename,
    options: ORMS,
    code: `${head}\nexport async function page(id: string) { ${body} }`,
  };
}

function invalid(body: string, names: string, head = IMPORTS) {
  return {
    ...inPage(body, head),
    errors: [
      {
        messageId: 'sequential' as const,
        data: { count: String(names.split(', ').length), names },
      },
    ],
  };
}

typescriptRuleTester().run('no-sequential-independent-reads (project functions)', rule, {
  valid: [
    inPage(
      'const a = await readUser(id); const b = await listOrders(id);',
      "import { 'readUser' as readUser } from './defaults';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await mutable(id); const b = await listOrders(id);',
      "import { mutable } from './lists';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await ShapeAlias(id); const b = await listOrders(id);',
      "import { ShapeAlias } from './lists';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await value(id); const b = await listOrders(id);',
      "import value from './constant';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await value(id); const b = await listOrders(id);',
      "import value from './nodefault';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await value(id); const b = await listOrders(id);',
      "import value from './data.json';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await everything(id); const b = await listOrders(id);',
      "import * as everything from './users';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await load(id); const b = await listOrders(id);',
      "import type { load } from './users';\nimport { listOrders } from './users';",
    ),
    inPage(
      'const a = await load(id); const b = await listOrders(id);',
      "import { listOrders } from './users';\nconst load = makeLoader();",
    ),
    inPage(
      'const a = await load(id); const b = await listOrders(id);',
      "import { listOrders } from './users';\nlet load = async (id: string) => prisma.user.findUnique({ where: { id } });",
    ),
    {
      filename,
      options: ORMS,
      code: "import { listOrders } from './users';\nexport async function page(id: string, load: (id: string) => Promise<unknown>) { const a = await load(id); const b = await listOrders(id); const c = await deleter(id); }",
    },
    inPage('const a = await deleter(id); const b = await listOrders(id);'),
    inPage('const user = await getUser(id); const orders = await listOrders(user.id);'),
    inPage('const user = await touchUser(id); const orders = await listOrders(id);'),
    inPage('const user = await cachedUser(id); const orders = await listOrders(id);'),
    inPage('const user = await getUser(id); const orders = await auditedOrders(id);'),
    inPage('const user = await rememberUser(id); const orders = await listOrders(id);'),
    inPage('const team = await getTeam(id); const orders = await listOrders(id);'),
    inPage('const user = await loadInto(ctx); const orders = await listOrders(id);'),
    inPage('const user = await keysOf(id); const orders = await listOrders(id);'),
    inPage(
      'const user = await local(id); const orders = await listOrders(id);',
      `${IMPORTS}\nasync function local(id: string) { const user = await prisma.user.findUnique({ where: { id } }); return audit(user); }`,
    ),
    inPage(
      'const user = await missing(id); const orders = await listOrders(id);',
      `${IMPORTS}\nimport { missing } from './nowhere';`,
    ),
    inPage(
      'const user = await getSession(id); const orders = await listOrders(id);',
      `${IMPORTS}\nasync function getSession(id: string) { return prisma.session.findFirst({ where: { id } }); }`,
    ),
  ],
  invalid: [
    invalid(
      'const a = await late(id); const b = await listOrders(id);',
      'a, b',
      "import { late } from './late';\nimport { listOrders } from './users';",
    ),
    invalid('const a = await readJson(id); const b = await listOrders(id);', 'a, b'),
    invalid('const a = await destructured(id); const b = await listOrders(id);', 'a, b'),
    invalid(
      'const a = await readOrders(id); const b = await team(id);',
      'a, b',
      "import { readOrders, team } from './lists';",
    ),
    invalid(
      'const a = await again(id); const b = await orderList(id);',
      'a, b',
      "import { again, orderList } from './lists';",
    ),
    invalid(
      'const a = await profile(id); const b = await fromDefault(id);',
      'a, b',
      "import { profile } from './lists';\nimport fromDefault from './defaults';",
    ),
    invalid(
      'const a = await orders(id); const b = await forwarded(id);',
      'a, b',
      "import orders from './lists';\nimport forwarded from './forwarding';",
    ),

    invalid('const user = await getUser(id); const orders = await listOrders(id);', 'user, orders'),
    invalid(
      'const profile = await loadProfile(id); const orders = await listOrders(id);',
      'profile, orders',
    ),
    invalid(
      'const user = await findUser(id); const orders = await listOrders(id);',
      'user, orders',
      "import { findUser, listOrders } from './index';",
    ),
    invalid(
      'const user = await readUser(id); const orders = await prisma.order.findMany({ where: { id } });',
      'user, orders',
      'const readUser = async (id: string) => prisma.user.findUnique({ where: { id } });',
    ),
  ],
});
