import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-sequential-independent-reads.mts';

const ORMS = [{ orms: ['prisma', 'typeorm', 'drizzle'], opensTransactions: false }];

function valid(code: string) {
  return { code, options: ORMS };
}

function invalid(code: string, names = 'a, b') {
  return {
    code,
    options: ORMS,
    errors: [
      {
        messageId: 'sequential' as const,
        data: { count: String(names.split(', ').length), names },
      },
    ],
  };
}

typescriptRuleTester().run('no-sequential-independent-reads', rule, {
  valid: [
    valid(
      'async function f(id) { const user = await prisma.user.findUnique({ where: { id } }); const orders = await prisma.order.findMany({ where: { userId: user.id } }); }',
    ),
    valid(
      'async function f(id) { const user = await prisma.user.findUnique({ where: { id } }); if (!user) return; const orders = await prisma.order.findMany({ where: { userId: id } }); }',
    ),
    valid(
      'async function f(id) { const user = await prisma.user.findUnique({ where: { id } }); await prisma.log.create({ data: { id } }); const orders = await prisma.order.findMany({ where: { userId: id } }); }',
    ),
    valid(
      'async function f(id) { await prisma.$transaction(async (tx) => { const a = await tx.user.findMany(); const b = await tx.order.findMany(); }); }',
    ),
    valid(
      'async function f(id) { const membership = await prisma.membership.findFirst({ where: { id } }); const orders = await prisma.order.findMany({ where: { id } }); }',
    ),
    valid(
      'async function f(id) { const session = await prisma.session.findFirst({ where: { id } }); const orders = await prisma.order.findMany({ where: { id } }); }',
    ),
    valid(
      'async function f(ids) { for (const id of ids) { const a = await prisma.user.findMany({ where: { id } }); const b = await prisma.order.findMany({ where: { id } }); } }',
    ),
    valid(
      'async function f(a, b) { const one = await fetch(a, { method: "POST", body: "x" }); const two = await fetch(b); }',
    ),
    valid(
      'async function f(a, b) { const one = await fetch(a, init); const two = await fetch(b); }',
    ),
    valid('async function f(a, b) { let one = await fetch(a); let two = await fetch(b); }'),
    valid(
      'async function f(page) { const a = await page.locator("x").count(); const b = await page.locator("y").count(); }',
    ),
    valid('async function f(id) { const a = await prisma.user.findMany(); }'),
    {
      code: 'async function f(id) { const a = await prisma.user.findMany(); const b = await prisma.order.findMany(); }',
      options: [{ orms: [], opensTransactions: false }],
    },
    valid('async function f(a, b) { const one = await load(a); const two = await load(b); }'),
    valid('async function f(a, b) { const one = await fetch(); const two = await fetch(); }'),
    valid(
      'async function f() { const a = await prisma.user.findMany(), b = await prisma.order.findMany(); const c = await prisma.team.findMany(); }',
    ),
    valid(
      'async function f(a, b) { const one = await fetch(a, {}, 1); const two = await fetch(b, {}, 1); }',
    ),
    valid(
      'async function f(a, b, o) { const one = await fetch(a, { ...o }); const two = await fetch(b, { ...o }); }',
    ),
    valid(
      'async function f(a, b, k) { const one = await fetch(a, { [k]: 1 }); const two = await fetch(b, { [k]: 1 }); }',
    ),
    valid(
      'async function f(a, b) { const one = await fetch(a, { "method": "GET" }); const two = await fetch(b, { "method": "GET" }); }',
    ),
    valid(
      'async function f(tx, id) { const a = await tx.select().from(users); const b = await tx.select().from(orders); }',
    ),
    valid(
      'async function f(db, id) { const a = await db.select().from(users).for("update"); const b = await db.select().from(orders); }',
    ),
    valid(
      'async function f(transactionScope) { const repo = transactionScope.getRepository("m"); const a = await repo.find(); const b = await repo.find({ where: {} }); }',
    ),
  ],
  invalid: [
    invalid(
      'async function f(id) { const blocks = await prisma.block.findMany(); const members = await prisma.member.findMany(); }',
      'blocks, members',
    ),
    invalid(
      'async function f(db) { const a = await db.select().from(users); const b = await db.select().from(orders); }',
    ),
    invalid(
      'async function f(id) { const user = await prisma.user.findUnique({ where: { id } }); const orders = await prisma.order.findMany({ where: { userId: id } }); }',
      'user, orders',
    ),
    invalid(
      'async function f(id) { const a = await prisma.team.findMany(); const b = await prisma.user.findMany(); const c = await prisma.booking.count(); }',
      'a, b, c',
    ),
    invalid(
      'async function f(a, b) { const one = await fetch(a); const two = await fetch(b, { method: "GET", headers: { x: "1" } }); }',
      'one, two',
    ),
    invalid(
      'async function f(a, b, h) { const one = await fetch(a, { headers: h }); const two = await fetch(b, { headers: h }); }',
      'one, two',
    ),
    invalid(
      'async function f() { const { a } = await prisma.user.findFirst(); const { b } = await prisma.order.findFirst(); }',
      '{ a }, { b }',
    ),
    invalid(
      'async function f(db, k) { const a = await db.select()[k]().from(users); const b = await db.select().from(orders); }',
    ),
    {
      code: 'async function f(a, b) { const one = await fetch(a); const two = await fetch(b); }',
      errors: [{ messageId: 'sequential' as const, data: { count: '2', names: 'one, two' } }],
    },
    invalid(
      'class R { async page(where) { const total = await this.repository.count({ where }); const rows = await this.repository.find({ where }); return { total, rows }; } }',
      'total, rows',
    ),
    invalid(
      'const f = async (id) => { const a = await prisma.user.findMany(); const b = await prisma.order.findMany({ where: { id } }); };',
    ),
  ],
});
