for (let offset = 0; offset < total; offset += pageSize) { await api.list({ offset }); }
export {};
