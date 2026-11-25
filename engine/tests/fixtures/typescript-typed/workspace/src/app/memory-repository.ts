import type { Repository } from './ports';

export class MemoryRepository implements Repository {
  private value = '';

  load(): string {
    return this.value;
  }

  save(value: string): void {
    this.value = value;
  }
}
