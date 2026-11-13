import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { type Fields, requiredFields } from '../../scripts/json/fields.mts';

const RECORDS_FILE = 'runs.jsonl';

export function appendRecordAsSingleWrite(directory: string, record: unknown): void {
  mkdirSync(directory, { recursive: true });
  const descriptor = openSync(path.join(directory, RECORDS_FILE), 'a');
  try {
    writeSync(descriptor, `${JSON.stringify(record)}\n`);
  } finally {
    closeSync(descriptor);
  }
}

export function readRecords(directory: string): readonly Fields[] {
  const file = path.join(directory, RECORDS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => requiredFields(JSON.parse(line), 'run record'));
}
