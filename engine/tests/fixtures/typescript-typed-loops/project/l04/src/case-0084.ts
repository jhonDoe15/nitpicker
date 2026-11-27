import knex from 'knex'; for (const id of ids) { await knex('users').where({ id }); }
export {};
