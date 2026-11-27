let skip = 0; while (skip < total) { await api.list({ skip }); skip += 100; }
export {};
