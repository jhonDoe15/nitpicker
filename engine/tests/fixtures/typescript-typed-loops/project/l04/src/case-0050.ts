chunks.forEach(async (part) => { await repository.saveAll(part); });
export {};
