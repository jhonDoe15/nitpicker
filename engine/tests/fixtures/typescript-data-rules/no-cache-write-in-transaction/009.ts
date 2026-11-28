import Redis from 'ioredis';
const redis = new Redis();
await db.transaction().execute(async (trx) => { await trx.insertInto('u').values(v).execute(); }); await redis.del('u');