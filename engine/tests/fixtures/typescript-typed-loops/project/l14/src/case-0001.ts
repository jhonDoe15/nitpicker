for (const id of ids) { parts.push(knex.raw('?? = ?', [column, id])); }
export {};
