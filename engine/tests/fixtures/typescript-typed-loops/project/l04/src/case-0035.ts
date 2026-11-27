let cursor; do { const res = await api.list({ cursor }); cursor = res.next; } while (cursor);
export {};
