for (let i = 0; i < ids.length; i += 100) { await repository.findByIds(ids.slice(i, i + 100)); }
export {};
