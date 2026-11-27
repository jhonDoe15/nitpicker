for (const id of ids) { await db.query("select 1", [id]); }
export {};
