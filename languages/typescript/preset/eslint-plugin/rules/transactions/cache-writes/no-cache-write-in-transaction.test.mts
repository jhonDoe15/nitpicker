import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-cache-write-in-transaction.mts';

const ioredis = "import Redis from 'ioredis';\nconst redis = new Redis();\n";
const manager =
  "import { caching } from 'cache-manager';\nconst store = await caching('memory');\n";
const kysely = "import { Kysely } from 'kysely';\n";

typescriptRuleTester().run('no-cache-write-in-transaction', rule, {
  valid: cases([
    `${ioredis}await sequelize.transaction(async (t) => { await User.create({}, { transaction: t }); t.afterCommit(() => redis.del('u')); });`,
    `${ioredis}await dataSource.transaction(async (manager) => { await manager.save(user); manager.queryRunner.once('commit', () => redis.del('u')); });`,
    "await prisma.$transaction(async (tx) => { await tx.user.create({ data }); const cacheKey = new URLSearchParams(); cacheKey.set('a', 'b'); });",
    "await prisma.$transaction(async (tx) => { await tx.user.create({ data }); cachedHeaders.set('a', 'b'); cacheConfig.reset(); form.cacheBuster.set(1); });",
    `${ioredis}const user = await prisma.$transaction(async (tx) => tx.user.create({ data })); await redis.set(user.id, 1);`,
    `${ioredis}await prisma.$transaction(async (tx) => { await tx.user.create({ data }); });\nawait redis.del('users');`,
    "await prisma.$transaction(async (tx) => { await tx.user.create({ data }); logger.set('a', 1); });",
    `${ioredis}await dataSource.transaction(async (manager) => { await manager.save(user); }); await redis.set('a', 1);`,
    `${ioredis}await db.transaction().execute(async (trx) => { await trx.insertInto('u').values(v).execute(); }); await redis.del('u');`,
    `${ioredis}await prisma.$transaction([prisma.user.create({ data })]); await redis.del('u');`,
    `${ioredis}await prisma.$transaction(async (tx) => { await tx.user.create({ data }); setTimeout(() => redis.del('u'), 0); });`,
    `${kysely}await prisma.$transaction(async (tx) => { const rows = new Map(); rows.set('a', 1); });`,
    'class Users { private cache = new Map(); async add(data) { await this.cache.set("x", data); await prisma.$transaction(async (tx) => { const rows = await tx.user.findMany(); this.cache.set("all", rows); }); } }',
    'class Users { private cache = new Map(); async add(data) { const user = await prisma.$transaction(async (tx) => tx.user.create({ data })); this.cache.set(user.id, user); } }',
    'class Users { private cache = new Map(); async add(data) { await prisma.$transaction(async (tx) => { await tx.user.create({ data }); this.cache.delete(data.id); }); } }',
  ]),
  invalid: [
    "import { createClient } from 'redis';\nconst store = createClient();\nawait prisma.$transaction(async (tx) => { await tx.user.create({ data }); await store.set('u', 1); });",
    `${ioredis}await prisma.$transaction(async (tx) => { await tx.user.create({ data }); await redis.set('u', 1); });`,
    `${ioredis}await prisma.$transaction(async (tx) => { await tx.user.create({ data }); await redis.del('u'); });`,
    `${manager}await prisma.$transaction(async (tx) => { await tx.user.update({ data }); await store.del('u'); });`,
    "await prisma.$transaction(async (tx) => { await tx.user.create({ data }); await this.cacheManager.set('u', 1); });",
    "await dataSource.transaction(async (manager) => { await manager.save(user); await this.redis.setex('u', 60, 1); });",
    "await this.dataSource.manager.transaction(async (manager) => { await manager.save(user); await this.cache.del('u'); });",
    `${kysely}await db.transaction().execute(async (trx) => { await trx.insertInto('u').values(v).execute(); await redis.hset('u', 'a', 1); });`,
    `${ioredis}const runner = dataSource.createQueryRunner(); await runner.startTransaction(); await runner.manager.save(user); await redis.expire('u', 1); await runner.commitTransaction();`,
  ].map((code) => ({ code, errors: [{ messageId: 'cacheWrite' }] })),
});

typescriptRuleTester().run('no-cache-write-in-transaction local maps', rule, {
  valid: [
    'class Users { private byId; async add(data) { await prisma.$transaction(async (tx) => { const user = await tx.user.create({ data }); this.byId.set(user.id, user); }); } }',
  ],
  invalid: [
    'class Users { private cache = new Map(); async add(data) { await prisma.$transaction(async (tx) => { const user = await tx.user.create({ data }); this.cache.set(user.id, user); }); } }',
    'const users = new Map(); await dataSource.transaction(async (manager) => { const saved = await manager.save(user); users.set(saved.id, saved); });',
    "const byId = new Map(); await db.transaction().execute(async (trx) => { const row = await trx.insertInto('u').values(v).returningAll().executeTakeFirstOrThrow(); byId.set(row.id, row); });",
  ].map((code) => ({ code, errors: [{ messageId: 'localWrite' }] })),
});
