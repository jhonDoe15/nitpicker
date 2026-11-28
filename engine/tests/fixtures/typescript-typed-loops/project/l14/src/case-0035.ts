await Promise.all(ids.map((id) => knex.raw('select ?', [id])));
export {};
