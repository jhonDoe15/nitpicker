for (const id of ids) { await db.users.replace(id, 'x'); }
export {};
