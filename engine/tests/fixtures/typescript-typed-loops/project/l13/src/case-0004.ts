for (const id of ids) { parts.push({ sql: joinSql.sql.replace('select * ', '').replace('where', 'and') }); }
export {};
