import type { Repository } from './ports';

export function current(repository: Repository): string {
  return repository.load();
}
