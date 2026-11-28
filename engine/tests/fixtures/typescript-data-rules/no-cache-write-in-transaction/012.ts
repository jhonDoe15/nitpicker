import { Kysely } from 'kysely';
await prisma.$transaction(async (tx) => { const rows = new Map(); rows.set('a', 1); });