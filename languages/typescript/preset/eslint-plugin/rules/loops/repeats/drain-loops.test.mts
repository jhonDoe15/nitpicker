import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

function reported(messageId: string) {
  return (code: string) => ({ code, errors: [{ messageId }] });
}

ruleTester.run('no-io-in-loop drain loops', ioInLoop, {
  valid: cases([
    'for (;;) { const rows = await repo.find({ take: 500 }); if (rows.length === 0) break; await repo.remove(rows); }',
    'for (;;) { const rows = await repo.find({ take: 500 }); if (!rows.length) return; await repo.remove(rows); }',
    'while (true) { const rows = await this.repository.find({ take: BATCH, select: ["id"] }); if (!rows.length) break; await this.repository.delete(rows.map((row) => row.id)); }',
    'let rows; do { rows = await repo.find({ take: 100 }); await repo.remove(rows); } while (rows.length > 0);',
    'let rows; do { rows = await repo.find({ take: 100 }); await repo.remove(rows); } while (rows.length === 100);',
    'let done = false; while (!done) { const batch = await prisma.job.findMany({ take: batchSize }); if (batch.length < batchSize) done = true; await prisma.job.deleteMany({ where: { id: { in: batch.map((job) => job.id) } } }); }',
    'let done = false; while (!done) { const batch = await prisma.job.findMany({ take: batchSize }); done = batch.length < batchSize; await prisma.job.deleteMany({ where: { id: { in: batch.map((job) => job.id) } } }); }',
    'for (let attempt = 0; attempt < 100; attempt++) { const rows = await repo.find({ take: 50 }); if (rows.length === 0) break; await repo.delete(rows.map((row) => row.id)); }',
    'while (!this.isAborted) { const rows = await prisma.event.findMany({ take: batchSize, where: { done: false } }); if (rows.length === 0) break; await prisma.event.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { done: true } }); }',
    'for (;;) { const rows = await db.select().from(events).limit(500); if (!rows.length) break; await db.delete(events).where(inArray(events.id, rows.map((row) => row.id))); }',
    'for (;;) { const page = await repository.find({ limit: 200 }); if (page.length === 0) break; await Promise.all(page.map((row) => queue.push(row))); }',
  ]),
  invalid: [
    ...[
      'for (let i = 0; i < ids.length; i++) { const rows = await repo.find({ where: { id: ids[i] }, take: 1 }); if (rows.length === 0) break; }',
      'while (queue.length) { const parent = queue.shift(); const rows = await repo.find({ where: { parentId: parent }, take: 100 }); if (!rows.length) break; }',
      'for (let i = 0; i < ids.length; i++) { const rows = await db.select().from(users).where(eq(users.id, ids[i])).limit(1); if (!rows.length) break; }',
      'for (;;) { const rows = await repo.find({}); if (!rows.length) break; }',
      'for (;;) { const rows = await repo.find({ take: 10 }); use(rows); }',
      'for (const id of ids) { const rows = await repo.find({ take: 10 }); if (!rows.length) break; }',
      'for (;;) { const rows = await repo.find({ take: 500 }); if (rows.length === 0) break; for (const row of rows) { await repo.remove(row); } }',
      'for (;;) { const rows = await repo.find({ take: 500 }); use(rows); if (done()) break; }',
    ].map(reported('query')),
  ],
});
