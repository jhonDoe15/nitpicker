for (const id of ids) { const { rowCount } = await knex.raw('update t set a = 1 where id = ?', [id]); }
export {};
