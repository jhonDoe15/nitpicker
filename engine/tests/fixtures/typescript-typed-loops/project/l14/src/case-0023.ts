for (const id of ids) { await repo.createQueryBuilder().delete().from(A).where('id = :id', { id }).execute(); }
export {};
