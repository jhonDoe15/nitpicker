for (const id of ids) { await knex.raw('select 1 where id = ?', [id]); }
export {};
