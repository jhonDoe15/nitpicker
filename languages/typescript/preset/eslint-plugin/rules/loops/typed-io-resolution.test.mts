import { rule as ioInLoop } from './no-io-in-loop.mjs';
import { IO_FILES, IO_STORE } from '../../test-support/projects/io-store-fixture.mts';
import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';

const { tester, typed } = typedIoProject('io-resolution', IO_STORE, IO_FILES);

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

function loop(statement: string) {
  return `${HEADER}export async function run() { for (const id of ids) { ${statement} } }`;
}

function caseOf(statement: string, messageId: string, callee?: string) {
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
