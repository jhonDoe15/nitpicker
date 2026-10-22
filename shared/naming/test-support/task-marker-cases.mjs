import { readFileSync } from 'node:fs';
import path from 'node:path';

const CASES = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../task-marker-cases.json'), 'utf8'),
);

export function taskMarkerCases(engine, reported) {
  return CASES.filter(
    (row) =>
      row.reported === reported && (row.engines === undefined || row.engines.includes(engine)),
  );
}
