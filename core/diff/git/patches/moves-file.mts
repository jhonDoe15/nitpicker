import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function withMovesFile<T>(
  moves: ReadonlyMap<string, string>,
  operation: (file: string | undefined) => T,
): T {
  if (moves.size === 0) {
    return operation(undefined);
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-'));
  const movesFile = path.join(directory, 'moves.json');
  try {
    writeFileSync(movesFile, JSON.stringify([...moves]));
    return operation(movesFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
