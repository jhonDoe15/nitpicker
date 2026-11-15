import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

export function stubCallsLog(directory: string): () => string[] {
  const log = path.join(directory, 'calls.jsonl');
  writeFileSync(log, '');
  vi.stubEnv('FAKE_PYTHON_LOG', log);
  return () => readFileSync(log, 'utf8').split('\n').filter(Boolean);
}
