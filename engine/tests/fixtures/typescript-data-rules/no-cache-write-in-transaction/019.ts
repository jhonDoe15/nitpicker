import { caching } from 'cache-manager';
const store = await caching('memory');
await prisma.$transaction(async (tx) => { await tx.user.update({ data }); await store.del('u'); });