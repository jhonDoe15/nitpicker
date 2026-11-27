for (const id of ids) { const qb = repo.createQueryBuilder('a'); const rows = await qb.where({ id }).getOne(); use(rows); }
export {};
