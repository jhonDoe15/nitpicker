for (const id of ids) { const user = await this.userRepo.findOne({ id }); }
export {};
