import { rmSync } from 'node:fs';
import { afterAll, afterEach } from 'vitest';

export function temporaryRoots(): string[] {
  const created: string[] = [];
  afterEach(() => {
    for (const directory of created.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  return created;
}

export function rootsRemovedAfterAll(): string[] {
  const created: string[] = [];
  afterAll(() => {
    for (const directory of created.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  return created;
}
