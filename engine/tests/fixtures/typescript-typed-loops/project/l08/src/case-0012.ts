let i = 0; while (i < urls.length) { await api.get(urls[i]); i += 1; await sleep(10); }
export {};
