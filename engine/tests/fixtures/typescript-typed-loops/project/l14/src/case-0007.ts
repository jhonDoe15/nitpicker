for (const id of ids) { const rows = { total: this.knex.raw('count(*)') }; use(rows); }
export {};
