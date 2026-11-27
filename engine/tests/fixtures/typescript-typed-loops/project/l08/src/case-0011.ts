let i = 0; while (i < urls.length) { await api.get(urls[i], { timeout }); i++; await sleep(10); }
export {};
