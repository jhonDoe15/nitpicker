import Redis from 'ioredis';
const redis = new Redis();
await prisma.$transaction(async (tx) => { await tx.user.create({ data }); });
await redis.del('users');