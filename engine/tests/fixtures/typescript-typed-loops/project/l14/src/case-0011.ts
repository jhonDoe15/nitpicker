for (const id of ids) { const qb = this.repository.createQueryBuilder('a'); qb.where({ id }); use(qb); }
export {};
