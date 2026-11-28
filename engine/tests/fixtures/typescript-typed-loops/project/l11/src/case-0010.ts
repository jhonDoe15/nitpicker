const rows = ids.map((id) => repo.create({ id })); await repo.save(rows);
export {};
