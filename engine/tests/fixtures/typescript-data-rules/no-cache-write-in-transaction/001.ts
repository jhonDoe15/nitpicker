import Redis from 'ioredis';
const redis = new Redis();
await sequelize.transaction(async (t) => { await User.create({}, { transaction: t }); t.afterCommit(() => redis.del('u')); });