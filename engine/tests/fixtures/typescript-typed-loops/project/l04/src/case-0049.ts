for (const batch of batches) { await db.query("select 1 where id = any($1)", [batch]); }
export {};
