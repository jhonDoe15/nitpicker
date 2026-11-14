import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { chainOuterCall, describePath, ioEffect, ioKind } from './io-effects.mjs';

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

const probe = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { effect: '{{kind}}: {{path}}' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const effect = ioEffect(node, context);
        const outer = chainOuterCall(node);
        const reportedByOuter = outer !== undefined && ioKind(outer, context) === effect?.kind;
        if (effect !== undefined && !reportedByOuter) {
          context.report({
            node,
            messageId: 'effect',
            data: { kind: effect.kind, path: describePath(effect.path) },
          });
        }
      },
    };
  },
};

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
  'declare const id: string;',
  'declare const ids: string[];',
  'declare const groups: string[][];',
  'declare const apiClient: any;',
  'const db = knex({});',
  'const redis = new Redis();',
  'const prisma = new PrismaClient();',
  '',
].join('\n');

function body(statement) {
  return `${HEADER}export async function run() { ${statement} }`;
}

function caseOf(statement, kind, path) {
  return { ...typed(body(statement)), errors: [{ messageId: 'effect', data: { kind, path } }] };
}

tester.run('io effects resolution', probe, {
  valid: [
    body('await viaAny(apiClient, id);'),
    body('subscribe(id);'),
    body('later(id);'),
    body('const query = db("users"); query.where({ id }); use(query);'),
    body('model<{ id: string }>("User").find().where("id").equals(id);'),
    body('constants(id);'),
  ].map((code) => typed(`${code}\ndeclare function use(value: unknown): void;`)),
  invalid: [
    caseOf(
      'await prisma.user.createMany({ data: groups[0] });',
      'database',
      '`prisma.user.createMany()`',
    ),
    caseOf('await port.find(id);', 'database', '`port.find()`, which calls `pool.query()`'),
    caseOf('await loadRow(id);', 'database', '`loadRow()`, which calls `pool.query()`'),
    caseOf('await users.plain(id);', 'database', '`users.plain()`, which calls `pool.query()`'),
    caseOf('await store.byId(id);', 'database', '`store.byId()`, which calls `pool.query()`'),
    caseOf('await walk(id, 3);', 'database', '`walk()`, which calls `pool.query()`'),
    caseOf('await a(id);', 'remote', '`a()`, which calls `b()`, which calls `axios.get()`'),
    caseOf('await apiClient.post(id);', 'remote', '`apiClient.post()`'),
    caseOf(
      'await model<{ id: string }>("User").find().where("id").equals(id);',
      'database',
      '`model().find().where().equals()`',
    ),
    caseOf('await redis.get(id);', 'database', '`redis.get()`'),
  ],
});
