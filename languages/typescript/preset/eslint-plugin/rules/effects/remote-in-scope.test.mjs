import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { rule as inTransaction } from './no-remote-call-in-transaction.mjs';
import { rule as underLock } from './no-remote-call-under-lock.mjs';

const ruleTester = typescriptRuleTester();
const runner = 'const runner = dataSource.createQueryRunner(); await runner.startTransaction();';

ruleTester.run('no-remote-call-in-transaction', inTransaction, {
  valid: cases([
    `${runner} await runner.manager.save(order); await runner.commitTransaction(); await fetch(url);`,
    'await prisma.$transaction(async () => { await fetch(url); });',
    'await fetch(url); await prisma.$transaction(async (tx) => tx.order.create({}));',
    'await prisma.$transaction([prisma.order.create({}), prisma.user.create({})]); await fetch(url);',
    'await prisma.$transaction(async (tx) => { await tx.order.create({}); cache.set(id, 1); });',
    'await mutex.runExclusive(async () => { await fetch(url); });',
    `${runner} try { await runner.manager.save(order); await runner.commitTransaction(); } catch { await runner.rollbackTransaction(); } await fetch(url);`,
  ]),
  invalid: [
    'await prisma.$transaction(async (tx) => { await tx.order.create({}); if (!token) { token = await fetch(url); } });',
    `${runner} if (!order) { await runner.rollbackTransaction(); return; } await runner.manager.save(order); await fetch(url); await runner.commitTransaction();`,
    'await prisma.$transaction(async (tx) => { await tx.order.create({}); await httpClient.post(url); });',
    "await knex.transaction(async (trx) => { await trx('orders').insert({}); await fetch(url); });",
    `${runner} await runner.manager.save(order); await axiosClient.post(url); await runner.commitTransaction();`,
    'const t = await sequelize.transaction(); await orderRepository.save(o); await fetch(url); await t.commit();',
    'await db.transaction(async (tx) => { await Promise.all(ids.map((id) => tx.insert(id))); await fetch(url); });',
  ].map((code) => ({ code, errors: [{ messageId: 'transaction' }] })),
});

ruleTester.run('no-remote-call-under-lock', underLock, {
  valid: cases([
    'const release = await mutex.acquire(); try { count += 1; } finally { release(); } await fetch(url);',
    'await mutex.runExclusive(async () => { counter.increment(); });',
    "await queue.acquire('x', async () => fetch(url));",
    'await prisma.$transaction(async (tx) => { await tx.order.create({}); await fetch(url); });',
    'await mutex.runExclusive(async () => { if (!token) { token = await fetch(url); } return token; });',
    'await mutex.runExclusive(async () => { if (cache.has(key)) { return; } cache.set(key, await fetch(url)); });',
    'await mutex.runExclusive(async () => { token ??= await fetch(url); });',
  ]),
  invalid: [
    'await mutex.runExclusive(async () => { await fetch(url); });',
    "await lock.acquire('key', async () => { await httpClient.get(url); });",
    "await navigator.locks.request('x', async () => { await fetch(url); });",
    "await redlock.using(['a'], 1000, async () => { await apiClient.post(url); });",
    'const release = await mutex.acquire(); try { await fetch(url); } finally { release(); }',
    'await mutex.runExclusive(async () => { if (closed) { return; } await fetch(url); });',
    'const release = await mutex.acquire(); if (busy) { release(); return; } await fetch(url); release();',
  ].map((code) => ({ code, errors: [{ messageId: 'lock' }] })),
});

const STORE = [
  "import axios from 'axios';",
  "import { Producer } from 'kafkajs';",
  'declare const producer: Producer;',
  "export async function notify(id: string) { await axios.post('/notify', { id }); }",
  "export async function publish(id: string) { await producer.send({ topic: 'o', messages: [id] }); }",
  'export function format(id: string) { return id.trim(); }',
].join('\n');

const { tester, typed } = typedIoProject('remote-in-scope', STORE);
const HEADER = [
  "import { PrismaClient } from '@prisma/client';",
  "import { DataSource } from 'typeorm';",
  "import { Mutex, Semaphore } from 'async-mutex';",
  "import { Pool } from 'pg';",
  "import axios from 'axios';",
  "import { notify, publish, format } from './store';",
  'const prisma = new PrismaClient();',
  'declare const dataSource: DataSource;',
  'const mutex = new Mutex();',
  'const guard = new Mutex();',
  'const limiter = new Semaphore(5);',
  'const single = new Semaphore(1);',
  'const pool = new Pool();',
  'declare const apm: { startTransaction(name: string): { end(): void } };',
  'declare const uow: { transaction<T>(work: (ctx: { log(text: string): void }) => Promise<T>): Promise<T> };',
  '',
].join('\n');

function run(body) {
  return typed(`${HEADER}export async function run(id: string) { ${body} }`);
}

const prismaWrite =
  'await prisma.$transaction(async (db) => { await db.user.create({ data: { id } });';

tester.run('no-remote-call-in-transaction with types', inTransaction, {
  valid: [
    run(`${prismaWrite} await publish(id); });`),
    run(`${prismaWrite} format(id); }); await notify(id);`),
    run('await prisma.$transaction(async () => { await notify(id); });'),
    run(
      "const t = apm.startTransaction('job'); await prisma.user.findMany(); await notify(id); t.end();",
    ),
    run("await uow.transaction(async (ctx) => { ctx.log('x'); await notify(id); });"),
    run(
      'await prisma.$transaction(async (db) => { await db.user.create({ data: { id } }); setTimeout(() => notify(id), 1); });',
    ),
  ],
  invalid: [
    {
      ...run(`${prismaWrite} await notify(id); });`),
      errors: [
        {
          messageId: 'transaction',
          data: {
            callee: '`notify()`, which calls `axios.post()`',
            scope: 'prisma.$transaction()',
          },
        },
      ],
    },
    {
      ...run(
        'await dataSource.transaction(async (manager) => { await manager.save({ id }); await notify(id); });',
      ),
      errors: [{ messageId: 'transaction' }],
    },
    ...[
      'const runner = dataSource.createQueryRunner(); await runner.startTransaction(); await runner.manager.save({ id }); await Promise.all([1, 2].map(() => axios.post(id))); await runner.commitTransaction();',
      "await pool.query('BEGIN'); await pool.query('UPDATE orders SET paid = true'); await notify(id); await pool.query('COMMIT');",
      'await uow.transaction(async (ctx) => { await prisma.user.findMany(); await notify(id); });',
    ].map((code) => ({ ...run(code), errors: [{ messageId: 'transaction' }] })),
  ],
});

tester.run('no-remote-call-under-lock with types', underLock, {
  valid: [
    run('await mutex.runExclusive(async () => format(id));'),
    run('await Promise.all([id].map((url) => limiter.runExclusive(() => axios.get(url))));'),
  ],
  invalid: [
    {
      ...run('await mutex.runExclusive(async () => { await notify(id); });'),
      errors: [
        {
          messageId: 'lock',
          data: { callee: '`notify()`, which calls `axios.post()`', scope: 'mutex.runExclusive()' },
        },
      ],
    },
    ...[
      'const release = await guard.acquire(); try { await axios.get(id); } finally { release(); }',
      'await single.runExclusive(() => axios.get(id));',
    ].map((code) => ({ ...run(code), errors: [{ messageId: 'lock' }] })),
  ],
});
