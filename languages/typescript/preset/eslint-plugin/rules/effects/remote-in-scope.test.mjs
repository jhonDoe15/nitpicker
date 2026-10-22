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
  ]),
  invalid: [
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
  ]),
  invalid: [
    'await mutex.runExclusive(async () => { await fetch(url); });',
    "await lock.acquire('key', async () => { await httpClient.get(url); });",
    "await navigator.locks.request('x', async () => { await fetch(url); });",
    "await redlock.using(['a'], 1000, async () => { await apiClient.post(url); });",
    'const release = await mutex.acquire(); try { await fetch(url); } finally { release(); }',
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
  "import { Mutex } from 'async-mutex';",
  "import { notify, publish, format } from './store';",
  'const prisma = new PrismaClient();',
  'declare const dataSource: DataSource;',
  'const mutex = new Mutex();',
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
  ],
});

tester.run('no-remote-call-under-lock with types', underLock, {
  valid: [run('await mutex.runExclusive(async () => format(id));')],
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
  ],
});
