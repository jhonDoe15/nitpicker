import { createClient } from 'redis';
const store = createClient();
await prisma.$transaction(async (tx) => { await tx.user.create({ data }); await store.set('u', 1); });