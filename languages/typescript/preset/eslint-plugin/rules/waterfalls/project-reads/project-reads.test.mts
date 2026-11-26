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
  'src/index.ts': "export { getUser as findUser, listOrders } from './users';",
});
const filename = path.join(root, 'src/page.ts');
const NAMES =
  'getUser, listOrders, loadProfile, touchUser, cachedUser, auditedOrders, rememberUser, getTeam';
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
    inPage('const user = await getUser(id); const orders = await listOrders(user.id);'),
    inPage('const user = await touchUser(id); const orders = await listOrders(id);'),
    inPage('const user = await cachedUser(id); const orders = await listOrders(id);'),
    inPage('const user = await getUser(id); const orders = await auditedOrders(id);'),
    inPage('const user = await rememberUser(id); const orders = await listOrders(id);'),
    inPage('const team = await getTeam(id); const orders = await listOrders(id);'),
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
