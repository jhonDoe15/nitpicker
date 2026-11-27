await Promise.all(workspaces.map((workspace) => repository.find({ where: { id: In(allIds) } })));
export {};
