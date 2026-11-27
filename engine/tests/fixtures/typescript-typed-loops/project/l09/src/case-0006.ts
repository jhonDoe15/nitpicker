let done = false; while (!done) { const batch = await prisma.job.findMany({ take: batchSize }); if (batch.length < batchSize) done = true; await prisma.job.deleteMany({ where: { id: { in: batch.map((job) => job.id) } } }); }
export {};
