for (const id of ids) { const cleaned = query.sql.toLowerCase().split(';').join(' '); use(cleaned); }
export {};
