for (const workspace of workspaces) { await repository.find({ where: { _id: { $in: allIds } } }); }
export {};
