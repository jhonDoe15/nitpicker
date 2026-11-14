import { rmSync } from 'node:fs';
import { afterEach } from 'vitest';

export function temporaryRoots(): string[] {
  const created: string[] = [];
  afterEach(() => {
    for (const directory of created.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  return created;
}
