for (const id of ids) { const qb = repo.createQueryBuilder('a'); qb.where({ id }); const rows = await qb.getMany(); }
export {};
