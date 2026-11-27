for (const id of ids) { const created = await this.userRepository.create({ id }); }
export {};
