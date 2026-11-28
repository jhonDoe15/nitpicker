import Redis from 'ioredis';
const redis = new Redis();
await dataSource.transaction(async (manager) => { await manager.save(user); }); await redis.set('a', 1);