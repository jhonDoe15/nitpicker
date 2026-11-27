let i = 0; let done = false; while (!done) { const row = await repository.findById(ids[i]); if (!row) break; i += 1; done = i >= ids.length; }
export {};
