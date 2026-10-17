import type { createExpenseTracker } from '../../src/main/composition-root.js';

type FakeDisk = {
  readonly files: Map<string, string>;
  readonly writes: string[];
  readonly clock: { today: string };
};

export function createDisk(initial: Record<string, string> = {}, today = '2024-03-20'): FakeDisk {
  return { files: new Map(Object.entries(initial)), writes: [], clock: { today } };
}

export function open(create: typeof createExpenseTracker, disk: FakeDisk) {
  return create({
    readText: (path: string) => Promise.resolve(disk.files.get(path)),
    writeText: (path: string, text: string) => {
      disk.writes.push(path);
      disk.files.set(path, text);
      return Promise.resolve();
    },
    today: () => disk.clock.today,
  });
}

export function savedJson(disk: FakeDisk, path: string): unknown {
  const parsed: unknown = JSON.parse(disk.files.get(path) ?? 'null');
  return parsed;
}

export const HEADER = 'date,amount,category,note';
export const csvOf = (...rows: string[]) => [HEADER, ...rows].join('\n');
export const reportText = (...lines: string[]) => [...lines, ''].join('\n');
