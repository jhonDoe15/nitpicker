for (const id of ids) { const text = `select ${table}`.replace(marker, 'x'); use(text); }
export {};
