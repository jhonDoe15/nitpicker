import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import path from 'node:path';

const RECORDS_FILE = 'runs.jsonl';

/**
 * Appends one run record to `<directory>/runs.jsonl` as a single line, written with one `write`
 * call to a file opened for appending. Runner processes that share a results directory (one per
 * case or per range of runs) therefore never interleave or overwrite each other's lines.
 */
export function appendRecord(directory, record) {
  mkdirSync(directory, { recursive: true });
  const descriptor = openSync(path.join(directory, RECORDS_FILE), 'a');
  try {
    writeSync(descriptor, `${JSON.stringify(record)}\n`);
  } finally {
    closeSync(descriptor);
  }
}

export function readRecords(directory) {
  const file = path.join(directory, RECORDS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
