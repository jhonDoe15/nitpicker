import Redis from 'ioredis';
const redis = new Redis();
await dataSource.transaction(async (manager) => { await manager.save(user); manager.queryRunner.once('commit', () => redis.del('u')); });