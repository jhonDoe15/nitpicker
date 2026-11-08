import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const NOTES_FILE = 'kotlin-notes.json';

export function writeKotlinNotes(reportDir, notes) {
  writeFileSync(path.join(reportDir, NOTES_FILE), JSON.stringify(notes));
}

export function readKotlinNotes(reportRoot) {
  const file = path.join(reportRoot, NOTES_FILE);
  return (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []).map((message) => ({
    tool: 'kotlin',
    rule: 'build-note',
    path: '.',
    identity: `build-note:${message}`,
    message,
    classification: 'descriptive',
  }));
}
