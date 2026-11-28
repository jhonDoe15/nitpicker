for (const tag of tags) { try { await repo.insert(tag); } catch { await otherRepo.findOne({ where: { name: tag.name } }); } }
export {};
