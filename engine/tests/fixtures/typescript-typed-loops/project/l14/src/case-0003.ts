for (const id of ids) { const fragment = knex.raw('?? (?)', [id, length]); fragments.push(fragment); }
export {};
