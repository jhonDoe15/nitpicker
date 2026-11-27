ids.map(async (id) => knex.raw('select ?', [id]));
export {};
