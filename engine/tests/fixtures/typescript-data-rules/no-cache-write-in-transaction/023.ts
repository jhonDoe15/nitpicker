import { Kysely } from 'kysely';
await db.transaction().execute(async (trx) => { await trx.insertInto('u').values(v).execute(); await redis.hset('u', 'a', 1); });