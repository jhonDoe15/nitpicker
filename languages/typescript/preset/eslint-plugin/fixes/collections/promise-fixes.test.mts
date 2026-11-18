import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/collections/pipelines/no-wasted-collection-step.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/billing/domain/totals.ts';

function awaited(method: string, outputs: (string | null)[]) {
  return outputs.map((output) => ({
    messageId: 'awaitInPromiseMethod',
    data: { method },
    ...(output === null ? {} : { suggestions: [{ messageId: 'dropAwait', output }] }),
  }));
}

const inAsync = (body: string) => `async function f() { ${body} }`;

function dropping(code: string, outputs: string[]) {
  return { filename, code: inAsync(code), errors: awaited('all', outputs.map(inAsync)) };
}

function keeping(code: string, method = 'all', count = 1) {
  return {
    filename,
    code: inAsync(code),
    errors: awaited(
      method,
      Array.from({ length: count }, () => null),
    ),
  };
}

tester.run('await in Promise.all suggestion', rule, {
  valid: [
    'async function f() { return Promise.all([a(), b()]); }',
    'async function f() { return Promise.all(tasks); }',
    'async function f() { const x = await a(); return Promise.all([b(x), c(x)]); }',
    'async function f() { return [await a(), await b()]; }',
    'async function f() { return Promise.all(await a(), b()); }',
  ].map((code) => ({ filename, code })),
  invalid: [
    dropping('return Promise.all([await a(), await b()]);', [
      'return Promise.all([a(), await b()]);',
      'return Promise.all([await a(), b()]);',
    ]),
    dropping('return Promise.all([await a(), b()]);', ['return Promise.all([a(), b()]);']),
    dropping('return Promise.all([a(), await b()]);', ['return Promise.all([a(), b()]);']),
    dropping('return Promise.all([await a()]);', ['return Promise.all([a()]);']),
    dropping('return Promise.all([await a(), await b(), await c()]);', [
      'return Promise.all([a(), await b(), await c()]);',
      'return Promise.all([await a(), b(), await c()]);',
      'return Promise.all([await a(), await b(), c()]);',
    ]),
    dropping('const [rows, count] = await Promise.all([await a(), b()]);', [
      'const [rows, count] = await Promise.all([a(), b()]);',
    ]),
    dropping('return Promise.all([await (a()), b()]);', ['return Promise.all([(a()), b()]);']),
    dropping('return Promise.all([await (ok ? a() : b()), c()]);', [
      'return Promise.all([(ok ? a() : b()), c()]);',
    ]),
    dropping('return Promise.all([await db.users.count(), await db.rows.find({ id })]);', [
      'return Promise.all([db.users.count(), await db.rows.find({ id })]);',
      'return Promise.all([await db.users.count(), db.rows.find({ id })]);',
    ]),
    dropping('return Promise.all([await\n    a(), b()]);', ['return Promise.all([a(), b()]);']),
    {
      filename,
      code: 'export const f = async () => Promise.all([await a(), b()]);',
      errors: awaited('all', ['export const f = async () => Promise.all([a(), b()]);']),
    },
    keeping('return Promise.allSettled([await a(), b()]);', 'allSettled'),
    keeping('return Promise.any([await a(), b()]);', 'any'),
    keeping('return Promise.race([await a(), b()]);', 'race'),
    keeping('return Promise.all([await /* now */ a(), b()]);'),
    keeping('return Promise.all([await a(), b(x++)]);'),
    keeping('return Promise.all([await a(), await b(total += 1)]);', 'all', 2),
    keeping('return Promise.all([await a(), b(x => { seen = x; })]);'),
    keeping('return prisma.$transaction(async (tx) => Promise.all([await tx.a(), tx.b()]));'),
    keeping(
      'return knex.transaction(async (trx) => { return Promise.all([await a(trx), b(trx)]); });',
    ),
    keeping('return withTransaction(() => Promise.all([await a(), b()]));'),
    {
      filename,
      code: 'class S { @Transactional() async run() { return Promise.all([await a(), b()]); } }',
      errors: awaited('all', [null]),
    },
    {
      filename,
      code: 'async function f(Promise) { return Promise.all([await a(), b()]); }',
      errors: awaited('all', [null]),
    },
  ],
});
