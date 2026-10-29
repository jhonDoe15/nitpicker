import { rule as ioInLoop } from '../rules/loops/no-io-in-loop.mjs';
import { typedIoProject } from '../test-support/typed-io-project.mjs';

const STORE = [
  "import { Pool } from 'pg';",
  "import axios from 'axios';",
  'export const pool = new Pool();',
  'declare const bus: { on(event: string, handler: (id: string) => unknown): void };',
  'export interface OrderPort { find(id: string): Promise<unknown> }',
  'export class PgOrders implements OrderPort {',
  '  async find(id: string) { return pool.query("select 1", [id]); }',
  '}',
  'export function loadRow(id: string): Promise<unknown>;',
  'export function loadRow(id: number): Promise<unknown>;',
  'export function loadRow(id: string | number) { return pool.query("select 1", [id]); }',
  'async function plain(id: string) { return pool.query("select 1", [id]); }',
  'export const users = { plain };',
  'export abstract class BaseRepo {',
  '  async byId(id: string) { return pool.query("select 1", [id]); }',
  '}',
  'export interface ById { byId(id: string): Promise<unknown> }',
  'export class OrderRepo extends BaseRepo implements ById {}',
  'export async function walk(id: string, depth: number): Promise<unknown> {',
  '  if (depth === 0) return pool.query("select 1", [id]);',
  '  return walk(id, depth - 1);',
  '}',
  'export async function a(id: string): Promise<unknown> { return b(id); }',
  'export async function b(id: string): Promise<unknown> { return id ? a(id) : axios.get(id); }',
  'export function viaAny(client: any, id: string) { return client.query(id); }',
  'export function subscribe(topic: string) {',
  '  bus.on(topic, async (id) => { await pool.query("select 1", [id]); });',
  '}',
  'export function later(id: string) {',
  '  setTimeout(() => { void pool.query("delete", [id]); }, 1000);',
  '}',
].join('\n');

const FILES = {
  'orders.test.ts': [
    "import type { OrderPort } from './store';",
    'export const fakeOrders: OrderPort = { find: async (id) => ({ id }) };',
  ].join('\n'),
  'plain.ts': 'export const x = 1;',
};

const { tester, typed } = typedIoProject('io-resolution', STORE, FILES);

const HEADER = [
  "import { loadRow, users, walk, a, viaAny, subscribe, later, type OrderPort, type ById } from './store';",
  "import knex from 'knex';",
  "import { model } from 'mongoose';",
  "import Redis from 'ioredis';",
  "import { PrismaClient } from '@prisma/client';",
  "import * as constants from './plain';",
  'declare const port: OrderPort;',
  'declare const store: ById;',
  'declare const ids: string[];',
  'declare const groups: string[][];',
  'declare const apiClient: any;',
  'const db = knex({});',
  'const redis = new Redis();',
  'const prisma = new PrismaClient();',
  '',
].join('\n');

function loop(statement) {
  return `${HEADER}export async function run() { for (const id of ids) { ${statement} } }`;
}

function caseOf(statement, messageId, callee) {
  const data = callee === undefined ? {} : { data: { callee } };
  return { ...typed(loop(statement)), errors: [{ messageId, ...data }] };
}

tester.run('no-io-in-loop resolution', ioInLoop, {
  valid: [
    loop('await viaAny(apiClient, id);'),
    loop('subscribe(id);'),
    loop('later(id);'),
    loop('const query = db("users"); query.where({ id }); use(query);'),
    loop('model<{ id: string }>("User").find().where("id").equals(id);'),
    loop('constants(id);'),
    `${HEADER}export async function run() { for (const group of groups) { await prisma.user.createMany({ data: group }); } }`,
  ].map((code) => typed(`${code}\ndeclare function use(value: unknown): void;`)),
  invalid: [
    caseOf('await port.find(id);', 'query', '`port.find()`, which calls `pool.query()`'),
    caseOf('await loadRow(id);', 'query', '`loadRow()`, which calls `pool.query()`'),
    caseOf('await users.plain(id);', 'query', '`users.plain()`, which calls `pool.query()`'),
    caseOf('await store.byId(id);', 'query', '`store.byId()`, which calls `pool.query()`'),
    caseOf('await walk(id, 3);', 'query', '`walk()`, which calls `pool.query()`'),
    caseOf('await a(id);', 'request', '`a()`, which calls `b()`, which calls `axios.get()`'),
    caseOf('await apiClient.post(id);', 'request', '`apiClient.post()`'),
    caseOf('await model<{ id: string }>("User").find().where("id").equals(id);', 'query'),
    caseOf('await redis.get(id);', 'cacheQuery', '`redis.get()`'),
  ],
});
