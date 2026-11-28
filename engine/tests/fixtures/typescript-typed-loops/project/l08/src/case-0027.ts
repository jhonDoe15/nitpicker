for (const tag of tags) { try { validate(tag); } catch { await repo.findOne({ where: { name: tag.name } }); } await repo.save(tag); }
export {};
