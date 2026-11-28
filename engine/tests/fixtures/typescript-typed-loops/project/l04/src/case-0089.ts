ids.reduceRight(async (acc, id) => { await repository.save(id); return acc; }, 0);
export {};
