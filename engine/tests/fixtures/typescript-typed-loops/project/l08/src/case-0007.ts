for (let tries = 0; tries < 3; tries++) { const row = await db.query("select 1 where id = $1", [id]); if (row) { return row; } await backoff(tries); }
export {};
