for (const id of ids) { await pool.query("select 1", [id]); }
export {};
