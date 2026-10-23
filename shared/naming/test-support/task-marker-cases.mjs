import { readFileSync } from 'node:fs';
import path from 'node:path';

const CASES_FILE = path.resolve(import.meta.dirname, '../task-marker-cases.json');

export function taskMarkerCases(engine, reported) {
  return JSON.parse(readFileSync(CASES_FILE, 'utf8')).filter(
    (row) =>
      row.reported === reported && (row.engines === undefined || row.engines.includes(engine)),
  );
}
