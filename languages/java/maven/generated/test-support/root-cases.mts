import { readFileSync } from 'node:fs';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';

export type RootCase = {
  readonly buildDir: string;
  readonly root: string;
  readonly generated: boolean;
};

export function readRootCases(): RootCase[] {
  const text = readFileSync(new URL('../fixtures/root-cases.json', import.meta.url), 'utf8');
  return listOf(parseJson(text)).map((entry) => ({
    buildDir: textOf(fieldOf(entry, 'buildDir')),
    root: textOf(fieldOf(entry, 'root')),
    generated: fieldOf(entry, 'generated') === true,
  }));
}
