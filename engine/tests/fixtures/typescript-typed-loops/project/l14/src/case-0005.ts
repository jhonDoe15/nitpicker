const fragments = ids.map((id) => this.knex.raw(`MIN(${id})`));
export {};
