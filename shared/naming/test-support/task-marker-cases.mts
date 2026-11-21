import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, listOf, textOf, textsOf } from '../../values/readers.mts';

const CASES_FILE = path.resolve(import.meta.dirname, 'task-marker-cases.json');

export type TaskMarkerCase = {
  name: string;
  text: string;
  reported: boolean;
  engines: string[] | undefined;
};

function readCases(): unknown {
  try {
    return JSON.parse(readFileSync(CASES_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${CASES_FILE}`, { cause: error });
  }
}

function toCase(row: unknown): TaskMarkerCase {
  const engines = fieldOf(row, 'engines');
  return {
    name: textOf(fieldOf(row, 'name')),
    text: textOf(fieldOf(row, 'text')),
    reported: fieldOf(row, 'reported') === true,
    engines: engines === undefined ? undefined : textsOf(engines),
  };
}

export function taskMarkerCases(engine: string, reported: boolean): TaskMarkerCase[] {
  return listOf(readCases())
    .map(toCase)
    .filter(
      (row) =>
        row.reported === reported && (row.engines === undefined || row.engines.includes(engine)),
    );
}
