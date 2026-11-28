for (const id of ids) { query.select(db.raw('? as ??', [expression, id])); }
export {};
