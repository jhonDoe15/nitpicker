const entities = []; for (const id of ids) { entities.push(this.projectRepository.create({ id })); } return entities;
export {};
