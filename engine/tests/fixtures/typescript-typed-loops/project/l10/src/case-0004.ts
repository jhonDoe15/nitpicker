const rows = await repo.find({ where: { id: In(ids) } });
export {};
