for (const id of ids) { const qb = repo.createQueryBuilder('a'); sub.push(qb.where('a.id = :id', { id }).getQuery()); }
export {};
