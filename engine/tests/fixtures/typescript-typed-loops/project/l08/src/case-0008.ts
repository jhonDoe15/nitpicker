while (queue.length) { const id = queue.shift(); await api.get(id); await sleep(100); }
export {};
