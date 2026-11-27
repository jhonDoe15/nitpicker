const entities = projects.map((project) => this.sharedCredentialsRepository.create({ projectId: project.id }));
export {};
