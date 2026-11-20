import { readFileSync } from 'node:fs';
import path from 'node:path';

type Cases = Record<string, Record<string, string>>;

const parseCases: (text: string) => Cases = JSON.parse;

export function loadCases(directory: string, name: string): Cases {
  const base = path.resolve(directory, 'fixtures');
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return parseCases(readFileSync(full, 'utf8'));
}

export function testsLayout(files: readonly { path: string }[]): {
  sourceRoots: string[];
  testFiles: string[];
} {
  return {
    sourceRoots: ['.'],
    testFiles: files.map(({ path: name }) => name).filter((name) => name.startsWith('tests/')),
  };
}

export function reasonsOf(notes: readonly string[]): string[] {
  return notes.map((note) => note.slice(note.indexOf(' as is: ') + ' as is: '.length));
}
