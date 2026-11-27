import knex from 'knex'; const query = knex('users'); for (const f of filters) { query.where(f); }
export {};
