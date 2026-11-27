for (const part of chunk(rows, 500)) { await prisma.user.createMany({ data: part }); }
export {};
