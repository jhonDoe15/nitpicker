import Redis from 'ioredis';
const redis = new Redis();
const user = await prisma.$transaction(async (tx) => tx.user.create({ data })); await redis.set(user.id, 1);