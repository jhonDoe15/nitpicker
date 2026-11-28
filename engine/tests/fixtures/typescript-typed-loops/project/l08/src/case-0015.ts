for (const id of ids) { const deadline = Date.now() + 1000; await api.get(id); }
export {};
