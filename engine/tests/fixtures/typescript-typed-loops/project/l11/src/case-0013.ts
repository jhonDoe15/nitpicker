for (const id of ids) { await this.albumUserRepository.create({ userId: id }); }
export {};
