import Redis from 'ioredis';
const redis = new Redis();
await prisma.$transaction([prisma.user.create({ data })]); await redis.del('u');