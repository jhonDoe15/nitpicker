const items = []; ids.forEach((id) => { items.push(this.repo.create({ id })); }); await this.repo.save(items);
export {};
