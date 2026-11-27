await Promise.all(memories.map((memory) => this.memoryRepository.create(memory)));
export {};
