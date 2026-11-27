for (const id of ids) { await knex("users").where({ id }).update({ seen: true }); }
export {};
