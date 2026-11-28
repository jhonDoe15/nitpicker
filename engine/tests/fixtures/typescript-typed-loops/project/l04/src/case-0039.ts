let offset = 0; while (offset < total) { const page = await api.list({ offset }); offset = page.next; }
export {};
