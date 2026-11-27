for (const id of ids) { const q = repo.createQueryBuilder('a').where({ id }); this.cache = q; await this.cache.getMany(); }
export {};
