import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { buildReference } from './build.mjs';
import { renderReference } from './render.mjs';

export const REFERENCE_DATA_PATH = 'shared/reference/rules.json';

/** `text` formatted as Prettier formats the committed file at `file`. */
export async function formattedText(repositoryRoot, file, text) {
  const target = path.join(repositoryRoot, file);
  const options = (await prettier.resolveConfig(target)) ?? {};
  return prettier.format(text, { ...options, filepath: target });
}

/** The generated files, by path relative to the repository root: the data file and the Markdown pages. */
export async function generatedReferenceFiles(repositoryRoot) {
  const entries = await buildReference(repositoryRoot);
  const files = [[REFERENCE_DATA_PATH, JSON.stringify(entries)], ...renderReference(entries)];
  return new Map(
    await Promise.all(
      files.map(async ([file, text]) => [file, await formattedText(repositoryRoot, file, text)]),
    ),
  );
}

/** The generated files whose committed text differs, or is missing. */
export async function staleReferenceFiles(repositoryRoot, generated) {
  return [...generated]
    .filter(([file, text]) => {
      try {
        return readFileSync(path.join(repositoryRoot, file), 'utf8') !== text;
      } catch {
        return true;
      }
    })
    .map(([file]) => file);
}
