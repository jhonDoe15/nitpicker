let cursor; while (true) { const res = await api.list({ cursor }); cursor = res.next; if (!cursor) break; }
export {};
