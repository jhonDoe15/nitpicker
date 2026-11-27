let done = false; while (!done) { const batch = await prisma.job.findMany({ take: batchSize }); done = batch.length < batchSize; await prisma.job.deleteMany({ where: { id: { in: batch.map((job) => job.id) } } }); }
export {};
