let cursor; for (;;) { const res = await api.list({ cursor }); cursor = res.next; if (!cursor) break; }
export {};
