import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { ormProject } from '../../../test-support/projects/orm-project.mts';
import { keyColumn } from './key-column.mts';
import { ormCall } from './orm-call.mts';

function firstKey(call: TSESTree.CallExpression): string | undefined {
  const [first] = call.arguments;
  const property =
    first?.type === AST_NODE_TYPES.ObjectExpression ? first.properties[0] : undefined;
  if (
    property?.type !== AST_NODE_TYPES.Property ||
    property.key.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const { value } = property;
  const inner =
    property.key.name === 'where' && value.type === AST_NODE_TYPES.ObjectExpression
      ? value.properties[0]
      : property;
  return inner?.type === AST_NODE_TYPES.Property && inner.key.type === AST_NODE_TYPES.Identifier
    ? inner.key.name
    : undefined;
}

const rule: TSESLint.RuleModule<'facts'> = {
  meta: { type: 'problem', schema: [], messages: { facts: '{{text}}' } },
  create(context) {
    return {
      CallExpression(call) {
        const found = ormCall(context, call);
        if (found === undefined) {
          return;
        }
        const property = firstKey(call);
        const key = property === undefined ? undefined : keyColumn(context, found, property);
        const subject = found.entity?.getSymbol()?.name ?? found.model ?? '-';
        const column =
          key === undefined || property === undefined
            ? 'no-key'
            : [
                `${property}:${key.type}`,
                key.primary ? 'primary' : '',
                key.unique ? 'unique' : '',
                key.comparable ? 'comparable' : 'inexact',
              ]
                .filter((part) => part !== '')
                .join(' ');
        const text = `${found.orm} ${found.pkg}@${found.version ?? '?'} ${found.method} ${subject} ${column}`;
        context.report({ node: call, messageId: 'facts', data: { text } });
      },
    };
  },
};

const ENTITIES =
  "import { Repository } from 'typeorm';\n" +
  "import { User, Code, BigThing, Token, Member } from './entities';\n" +
  "import { Note, Price, Coupon, Plain } from './entities';\n";
const PRISMA =
  "import { PrismaClient } from '@prisma/client';\ndeclare const prisma: PrismaClient;\n";
const REDIS =
  "import Redis, { Cluster } from 'ioredis';\nimport { createClient, createCluster } from 'redis';\n";

function run(statement: string, header = ENTITIES) {
  return `${header}export async function run(id: number, key: string) { ${statement} }`;
}

const repo = (entity: string, call: string) =>
  run(`declare const repo: Repository<${entity}>; await repo.${call};`);
const TYPEORM = 'typeorm typeorm@0.3.20 findOneBy';
const PRISMA_FIND = 'prisma .prisma/client@6.1.0 findUnique';
const base = ormProject('orm-call');
const old = ormProject('orm-call-old', { typeormVersion: '0.2.45' });
const mysql = ormProject('orm-call-mysql', { provider: 'mysql', dependencies: ['mysql2'] });

function found(project: typeof base, code: string, text: string) {
  return { ...project.typed(code), errors: [{ messageId: 'facts' as const, data: { text } }] };
}

base.tester.run('ormCall', rule, {
  valid: [
    run(
      'class Fake { findOneBy(where: object) { return where; } } await new Fake().findOneBy({ id });',
    ),
    run(
      'class W { findOneBy(w: object) { return w; } } declare const repo: W; await repo.findOneBy({ id });',
    ),
    run('declare const redis: Cluster; await redis.get(key);', REDIS),
    run('declare const client: ReturnType<typeof createCluster>; await client.get(key);', REDIS),
    run(
      'await prisma.$transaction(async (tx) => { await tx.user.findUnique({ where: { id } }); });',
      PRISMA,
    ),
    run('const user = prisma.user; await user.findUnique({ where: { id } });', PRISMA),
    run(
      'declare const rows: { findUnique(args: object): Promise<null> }; await rows.findUnique({ id });',
    ),
  ].map((code) => base.typed(code)),
  invalid: [
    found(base, repo('User', 'findOneBy({ id })'), `${TYPEORM} User id:number primary comparable`),
    found(
      base,
      repo('User', 'findOneBy({ email: key })'),
      `${TYPEORM} User email:string unique comparable`,
    ),
    found(base, repo('User', 'findOneBy({ name: key })'), `${TYPEORM} User name:string comparable`),
    found(base, repo('User', 'findOneBy({ nickname: key })'), `${TYPEORM} User no-key`),
    found(base, repo('User', 'findOneBy({ tags: key })'), `${TYPEORM} User no-key`),
    found(
      base,
      repo('Code', 'findOneBy({ slug: key })'),
      `${TYPEORM} Code slug:string primary comparable`,
    ),
    found(
      base,
      repo('BigThing', 'findOneBy({ id: key })'),
      `${TYPEORM} BigThing id:string primary inexact`,
    ),
    found(
      base,
      repo('Token', 'findOneBy({ id: key })'),
      `${TYPEORM} Token id:string primary inexact`,
    ),
    found(
      base,
      repo('Member', 'findOneBy({ teamId: id })'),
      `${TYPEORM} Member teamId:number comparable`,
    ),
    found(
      base,
      repo('Note', 'findOneBy({ email: key })'),
      `${TYPEORM} Note email:string comparable`,
    ),
    found(
      base,
      repo('Price', 'findOneBy({ amount: id })'),
      `${TYPEORM} Price amount:number unique inexact`,
    ),
    found(
      base,
      repo('Coupon', 'findOneBy({ code: key })'),
      `${TYPEORM} Coupon code:string unique comparable`,
    ),
    found(base, repo('Plain', 'findOneBy({ id })'), `${TYPEORM} Plain no-key`),
    found(
      base,
      run(
        'class UserRepository extends Repository<User> {}\n' +
          'declare const repo: UserRepository; await repo.findOneBy({ id });',
      ),
      `${TYPEORM} User id:number primary comparable`,
    ),
    found(
      base,
      run('await prisma.user.findUnique({ where: { id } });', PRISMA),
      `${PRISMA_FIND} User id:number primary comparable`,
    ),
    found(
      base,
      run('await prisma.user.findMany({ where: { name: key } });', PRISMA),
      'prisma .prisma/client@6.1.0 findMany User name:string comparable',
    ),
    found(
      base,
      run('await prisma.user.findUnique({ where: { email: key } });', PRISMA),
      `${PRISMA_FIND} User email:string unique comparable`,
    ),
    found(
      base,
      run('await prisma.doc.findUnique({ where: { id: key } });', PRISMA),
      `${PRISMA_FIND} Doc id:string primary inexact`,
    ),
    found(
      base,
      run('await prisma.team.findUnique({ where: { id: key } });', PRISMA),
      `${PRISMA_FIND} Team id:string primary comparable`,
    ),
    found(
      base,
      run('await prisma.user.findUnique({ where: { team: key } });', PRISMA),
      `${PRISMA_FIND} User no-key`,
    ),
    found(
      base,
      run('declare const redis: Redis; await redis.get(key);', REDIS),
      'ioredis ioredis@4.6.0 get - no-key',
    ),
    found(
      base,
      run('declare const redis: Redis; await redis.pipeline().get(key).exec();', REDIS),
      'ioredis ioredis@4.6.0 pipeline - no-key',
    ),
    found(
      base,
      run('declare const redis: Redis; await redis.multi().get(key).exec();', REDIS),
      'ioredis ioredis@4.6.0 multi - no-key',
    ),
    found(
      base,
      run('await createClient().get(key);', REDIS),
      'node-redis @redis/client@4.6.0 get - no-key',
    ),
  ],
});

old.tester.run('ormCall version', rule, {
  valid: [],
  invalid: [
    found(
      old,
      repo('User', 'findOneBy({ id })'),
      'typeorm typeorm@0.2.45 findOneBy User id:number primary comparable',
    ),
  ],
});

mysql.tester.run('ormCall on MySQL', rule, {
  valid: [],
  invalid: [
    found(
      mysql,
      repo('User', 'findOneBy({ email: key })'),
      `${TYPEORM} User email:string unique inexact`,
    ),
    found(mysql, repo('User', 'findOneBy({ id })'), `${TYPEORM} User id:number primary comparable`),
    found(
      mysql,
      run('await prisma.team.findUnique({ where: { id: key } });', PRISMA),
      `${PRISMA_FIND} Team id:string primary inexact`,
    ),
  ],
});

typescriptRuleTester().run('ormCall without type information', rule, {
  valid: [
    repo('User', 'findOneBy({ id })'),
    run('await prisma.user.findUnique({ where: { id } });', PRISMA),
    run('declare const redis: Redis; await redis.get(key);', REDIS),
  ].map((code) => ({ code })),
  invalid: [],
});
