async function run() { for (const id of ids) { return knex.raw('select ?', [id]); } }
export {};
