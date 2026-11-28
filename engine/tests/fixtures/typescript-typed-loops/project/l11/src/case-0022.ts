const ps = []; for (const id of ids) { const p = prisma.repo.create({ data: { id } }); ps.push(p); } await Promise.all(ps);
export {};
