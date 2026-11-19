import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJson, textsOf } from '../../../../shared/values/readers.mts';

type KotlinNote = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

const NOTES_FILE = 'kotlin-notes.json';

export function writeKotlinNotes(reportDir: string, notes: readonly string[]): void {
  writeFileSync(path.join(reportDir, NOTES_FILE), JSON.stringify(notes));
}

export function readKotlinNotes(reportRoot: string): KotlinNote[] {
  const file = path.join(reportRoot, NOTES_FILE);
  return textsOf(existsSync(file) ? parseJson(readFileSync(file, 'utf8')) : []).map((message) => ({
    tool: 'kotlin',
    rule: 'build-note',
    path: '.',
    identity: `build-note:${message}`,
    message,
    classification: 'descriptive',
  }));
}
