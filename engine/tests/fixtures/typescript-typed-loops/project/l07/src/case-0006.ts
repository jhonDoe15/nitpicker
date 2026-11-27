for (const row of rows) { const owner = await this.ownerRepository.findOneBy({ id: row.ownerId }); }
export {};
