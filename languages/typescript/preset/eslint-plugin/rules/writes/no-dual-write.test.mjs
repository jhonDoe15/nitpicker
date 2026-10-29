import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { rule } from './no-dual-write.mjs';

const kafka = "import { send } from 'kafkajs';\n";

typescriptRuleTester().run('no-dual-write', rule, {
  valid: cases([
    `${kafka}export async function run(order) { await send({ topic: 'o', messages: [order] }); }`,
    'export async function run(order) { await orderRepository.save(order); await httpClient.post(order); }',
    `${kafka}export async function run(order) { await orderRepository.findById(order); await send(order); }`,
    `${kafka}export function routes(app) { app.post('/o', async (req) => { await orderRepository.save(req.body); }); app.post('/p', async (req) => { await send(req.body); }); }`,
    `${kafka}export function listen(bus) { bus.on('o', async (o) => { await orderRepository.save(o); }); bus.on('p', (o) => send(o)); }`,
  ]),
  invalid: [
    {
      code: `${kafka}app.post('/o', async (req) => { await orderRepository.save(req.body); await send(req.body); });`,
      errors: [{ messageId: 'dualWrite' }],
    },
    {
      code: `${kafka}await orderRepository.save(order);\nawait send(order);`,
      errors: [{ messageId: 'dualWrite' }],
    },
    {
      code: `${kafka}export async function run(order) { await orderRepository.save(order); await send(order); }`,
      errors: [
        {
          messageId: 'dualWrite',
          data: { message: '`send()`', write: '`orderRepository.save()`' },
        },
      ],
    },
  ],
});

const STORE = [
  "import { PrismaClient } from '@prisma/client';",
  "import { Producer } from 'kafkajs';",
  'export const prisma = new PrismaClient();',
  'export declare const producer: Producer;',
  'export async function saveOrder(id: string) { await prisma.order.create({ data: { id } }); }',
  "export async function publish(id: string) { await producer.send({ topic: 'o', messages: [id] }); }",
  'export async function saveAndPublish(id: string) { await saveOrder(id); await publish(id); }',
].join('\n');

const { tester, typed } = typedIoProject('dual-write', STORE);
const HEADER = [
  "import { Sequelize } from 'sequelize';",
  "import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';",
  'declare const sequelize: Sequelize;',
  '',
].join('\n');

function run(body) {
  return typed(`${HEADER}export async function run(id: string) { ${body} }`);
}

const send = "await producer.send({ topic: 'o', messages: [id] });";

tester.run('no-dual-write with types', rule, {
  valid: [
    run('await saveAndPublish(id);'),
    run(`await prisma.order.findMany({ where: { id } }); ${send}`),
    run(
      'await prisma.$transaction(async (tx) => { await tx.order.create({ data: { id } }); await tx.user.create({ data: { id } }); });',
    ),
    run(`const later = async () => { ${send} }; await saveOrder(id); return later;`),
    run(
      "const rows = await prisma.order.findMany({ where: { id } }); for (const row of rows) { await producer.send({ topic: 'o', messages: [row.id] }); await prisma.order.update({ where: { id: row.id }, data: {} }); }",
    ),
  ],
  invalid: [
    {
      ...run(`await prisma.order.create({ data: { id } }); ${send}`),
      errors: [
        {
          messageId: 'dualWrite',
          data: { message: '`producer.send()`', write: '`prisma.order.create()`' },
        },
      ],
    },
    {
      ...run('await saveOrder(id); await publish(id);'),
      errors: [
        {
          messageId: 'dualWrite',
          data: {
            message: '`publish()`, which calls `producer.send()`',
            write: '`saveOrder()`, which calls `prisma.order.create()`',
          },
        },
      ],
    },
    {
      ...run(
        `await prisma.$transaction(async (tx) => { await tx.order.create({ data: { id } }); ${send} });`,
      ),
      errors: [{ messageId: 'dualWrite' }],
    },
    {
      ...run(
        `const t = await sequelize.transaction(); await saveOrder(id); t.afterCommit(async () => { ${send} }); await t.commit();`,
      ),
      errors: [{ messageId: 'afterCommit' }],
    },
    {
      ...run(
        `await prisma.$transaction(async (tx) => { await tx.order.create({ data: { id } }); }); ${send}`,
      ),
      errors: [{ messageId: 'afterCommit' }],
    },
    {
      ...run(
        `const rows = await prisma.order.findMany({ where: { id } }); for (const row of rows) { ${send} await prisma.order.update({ where: { id }, data: {} }); }`,
      ),
      errors: [{ messageId: 'dualWrite' }],
    },
    {
      ...typed(
        `${HEADER}export async function both(id: string) { await saveOrder(id); await publish(id); }\nexport async function caller(id: string) { await both(id); }`,
      ),
      errors: [{ messageId: 'dualWrite' }],
    },
  ],
});
