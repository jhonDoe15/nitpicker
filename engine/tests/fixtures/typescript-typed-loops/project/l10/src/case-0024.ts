for (const id of ids) { await repo.find({ where: { owner: id, status: In(roles) } }); }
export {};
