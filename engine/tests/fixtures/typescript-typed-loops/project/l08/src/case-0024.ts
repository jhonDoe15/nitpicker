for (const tag of tags) { try { await this.tagRepository.save(tag); } catch (error) { if (isUnique(error)) { await this.tagRepository.findOneBy({ name: tag.name }); } } }
export {};
