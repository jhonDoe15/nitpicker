import type { Rule } from 'eslint';
import { IO_FILES, IO_STORE } from '../../test-support/projects/io-store-fixture.mts';
import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { chainOuterCall, describePath, ioEffect, ioKind } from './io-effects.mjs';

const probe = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { effect: '{{kind}}: {{path}}' },
  },
  create(context: Rule.RuleContext) {
    return {
      CallExpression(node: Rule.Node) {
        const effect: { kind: string; path: string[] } | undefined = ioEffect(node, context);
        const outer: unknown = chainOuterCall(node);
        const reportedByOuter = outer !== undefined && ioKind(outer, context) === effect?.kind;
        if (effect !== undefined && !reportedByOuter) {
          context.report({
            node,
            messageId: 'effect',
            data: { kind: effect.kind, path: String(describePath(effect.path)) },
          });
        }
      },
    };
  },
};

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
  'declare const id: string;',
  'declare const ids: string[];',
  'declare const groups: string[][];',
  'declare const apiClient: any;',
  'const db = knex({});',
  'const redis = new Redis();',
  'const prisma = new PrismaClient();',
  '',
].join('\n');

function body(statement: string) {
  return `${HEADER}export async function run() { ${statement} }`;
}

function caseOf(statement: string, kind: string, path: string) {
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
