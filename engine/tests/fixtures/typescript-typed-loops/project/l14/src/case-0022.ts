for (const id of ids) { await repo.createQueryBuilder('a').where('a.id = :id', { id }).getMany(); }
export {};
