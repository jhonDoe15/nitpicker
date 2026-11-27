for (const workspace of workspaces) { await repository.find({ where: { parentId: In(workspace.childIds) } }); }
export {};
