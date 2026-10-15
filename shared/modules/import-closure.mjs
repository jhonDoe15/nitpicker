import { readFileSync } from 'node:fs';
import path from 'node:path';

const IMPORT_PATTERN = /\b(?:from|import)\s*\(?\s*'(\.[^']+)'/gu;

export function importClosure(entry) {
  const found = [path.resolve(entry)];
  for (const file of found) {
    const imports = [...readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)].map(([, specifier]) =>
      path.resolve(path.dirname(file), specifier),
    );
    found.push(...new Set(imports.filter((imported) => !found.includes(imported))));
  }
  return found;
}
