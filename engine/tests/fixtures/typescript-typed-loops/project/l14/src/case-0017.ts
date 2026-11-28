for (const id of ids) { const builder = knex("users").where({ id }).update({ seen: true }); use(builder); }
export {};
