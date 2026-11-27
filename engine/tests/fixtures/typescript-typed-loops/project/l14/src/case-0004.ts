const fragments = columns.map((column) => knex.raw('?? (?)', [column, length]));
export {};
