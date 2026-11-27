for (const id of ids) { await connection.execute('select 1', [id]); }
export {};
