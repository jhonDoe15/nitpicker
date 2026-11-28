import knex from 'knex'; for (const workspace of workspaces) { await knex('users').whereIn('id', allIds); }
export {};
