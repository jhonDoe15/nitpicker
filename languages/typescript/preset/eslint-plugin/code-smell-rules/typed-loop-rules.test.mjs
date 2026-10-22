import { rule as ioInLoop } from '../rules/loops/no-io-in-loop.mjs';
import { typedIoProject } from '../test-support/typed-io-project.mjs';

const STORE = [
  "import { Pool } from 'pg';",
  "import axios from 'axios';",
  "import { Model, type BelongsToGetAssociationMixin } from 'sequelize';",
  'export const pool = new Pool();',
  'export async function loadOrder(id: string) { return pool.query("select 1", [id]); }',
  'export async function loadPrice(id: string) { return axios.get(`/prices/${id}`); }',
  'export async function viaHelper(id: string) { return loadOrder(id); }',
  'export function format(id: string) { return id.trim(); }',
  'export class OrderService {',
  '  constructor(private readonly db: Pool) {}',
  '  async find(id: string) { return this.db.query("select 1", [id]); }',
  '}',
  'export class UserRepository { findById(id: string) { return id; } }',
  'export type OrderStore = { find(id: string): Promise<unknown> };',
  'export type Viewer = { update(id: string): void };',
  'export function createOrderStore(db: Pool): OrderStore {',
  '  return { find: (id) => db.query("select 1", [id]) };',
  '}',
  'export class Customer extends Model {',
  '  declare getAccount: BelongsToGetAssociationMixin<Customer>;',
  '}',
].join('\n');

const { tester, typed, typedScript } = typedIoProject('io-in-loop', STORE);

const STORE_IMPORT =
  "import { loadOrder, loadPrice, viaHelper, format, OrderService, UserRepository, createOrderStore, pool, Customer } from './store';\n";
const declared = 'declare const ids: string[];\ndeclare function use(value: unknown): void;\n';

function loop(statement, header = '') {
  return `${header}${STORE_IMPORT}${declared}export async function run() { for (const id of ids) { ${statement} } }`;
}

function caseOf(code, messageId, callee) {
  const data = callee === undefined ? {} : { data: { callee } };
  return { ...typed(code), errors: [{ messageId, ...data }] };
}

const typeorm =
  "import { Repository } from 'typeorm';\ndeclare const repo: Repository<{ id: string }>;\n";
const prisma =
  "import { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\n";
const kafka = "import { Producer } from 'kafkajs';\ndeclare const producer: Producer;\n";
const sqs =
  "import { SQSClient, SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';\n";
const dynamo = "import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';\n";
const knex = "import knex from 'knex';\nconst db = knex({});\n";
const viewer = "import type { Viewer } from './store';\ndeclare const viewer: Viewer;\n";

tester.run('no-io-in-loop with types', ioInLoop, {
  valid: [
    loop('format(id);'),
    loop('new UserRepository().findById(id);'),
    loop('viewer.update(id);', viewer),
    loop('repo.create({ id });', typeorm),
    loop('await producer.send({ topic: "orders", messages: [id] });', kafka),
    loop('await new SQSClient().send(new SendMessageCommand({ QueueUrl: id }));', sqs),
    loop('new Customer().get(id);'),
    `${STORE_IMPORT}${declared}export async function run() { await Promise.all(ids.map((id) => loadPrice(id))); }`,
    loop('const store = createOrderStore(pool); use(store);'),
  ].map((code) => typed(code)),
  invalid: [
    caseOf(loop('await loadOrder(id);'), 'query', '`loadOrder()`, which calls `pool.query()`'),
    caseOf(
      loop('await viaHelper(id);'),
      'query',
      '`viaHelper()`, which calls `loadOrder()`, which calls `pool.query()`',
    ),
    caseOf(loop('await loadPrice(id);'), 'request', '`loadPrice()`, which calls `axios.get()`'),
    caseOf(loop('await new OrderService(pool).find(id);'), 'query'),
    caseOf(
      loop('const store = createOrderStore(pool); await store.find(id);'),
      'query',
      '`store.find()`, which calls `db.query()`',
    ),
    caseOf(loop('await new Customer().getAccount();'), 'query'),
    caseOf(loop('await new Customer().save();'), 'query'),
    caseOf(loop('await repo.findOneBy({ id });', typeorm), 'query'),
    caseOf(loop('await prisma.user.findUnique({ where: { id } });', prisma), 'query'),
    caseOf(
      `${prisma}${declared}export async function run() { await Promise.all(ids.map((id) => prisma.user.findUnique({ where: { id } }))); }`,
      'concurrentQuery',
    ),
    caseOf(
      loop('await new DynamoDBClient().send(new GetItemCommand({ Key: id }));', dynamo),
      'query',
    ),
    caseOf(
      loop('await new SQSClient().send(new ReceiveMessageCommand({ QueueUrl: id }));', sqs),
      'request',
    ),
    caseOf(loop('await db("users").where({ id });', knex), 'query', '`db().where()`'),
    caseOf(loop('await fetch(`/orders/${id}`);'), 'request', '`fetch()`'),
    {
      ...typedScript(
        "import { loadOrder } from './store';\nexport async function run(ids) { for (const id of ids) { await loadOrder(id); } }",
      ),
      errors: [{ messageId: 'query' }],
    },
  ],
});
