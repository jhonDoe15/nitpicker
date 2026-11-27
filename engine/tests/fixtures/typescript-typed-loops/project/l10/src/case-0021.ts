for (const id of ids) { await repository.find({ where: { id: { $in: [id] } } }); }
export {};
