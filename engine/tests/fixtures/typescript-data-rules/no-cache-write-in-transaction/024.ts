import Redis from 'ioredis';
const redis = new Redis();
const runner = dataSource.createQueryRunner(); await runner.startTransaction(); await runner.manager.save(user); await redis.expire('u', 1); await runner.commitTransaction();