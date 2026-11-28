for (let i = 0; i < ids.length; i++) { await api.get(ids[i]); await sleep(100); }
export {};
