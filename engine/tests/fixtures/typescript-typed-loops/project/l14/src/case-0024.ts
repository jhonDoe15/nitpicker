for (const id of ids) { const rows = await this.repo.createQueryBuilder('a').where({ id }).getOne(); }
export {};
