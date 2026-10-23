import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { REFERENCE_DATA_DIRECTORY } from '../../shared/reference/store.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { buildReference } from './build.mjs';
import { renderReference } from './render.mjs';

const JSON_FILE = /\.json$/u;

function insideRepository(repositoryRoot, file) {
  const target = path.resolve(repositoryRoot, file);
  if (!target.startsWith(repositoryRoot + path.sep)) {
    throw new Error(`The generated file ${file} is outside the repository`);
  }
  return target;
}

/** `text` formatted as Prettier formats the committed file at `file`. */
export async function formattedText(repositoryRoot, file, text) {
  const target = insideRepository(repositoryRoot, file);
  const options = (await prettier.resolveConfig(target)) ?? {};
  return prettier.format(text, { ...options, filepath: target });
}

function dataFiles(entries) {
  const byPage = Map.groupBy(entries, ({ page }) => page);
  return PAGES.map(({ id }) => [
    `${REFERENCE_DATA_DIRECTORY}/${id}.json`,
    JSON.stringify(byPage.get(id) ?? []),
  ]);
}

/**
 * The generated files, by path relative to the repository root: the data file of each page, as
 * compact JSON, and the Markdown pages, already in the form Prettier gives them.
 */
export function referenceFiles(repositoryRoot) {
  const entries = buildReference(repositoryRoot);
  return new Map([...dataFiles(entries), ...renderReference(entries)]);
}

/** The generated files as they are committed: the data files formatted by Prettier. */
export async function formattedReferenceFiles(repositoryRoot) {
  return new Map(
    await Promise.all(
      [...referenceFiles(repositoryRoot)].map(async ([file, text]) => [
        file,
        JSON_FILE.test(file) ? await formattedText(repositoryRoot, file, text) : text,
      ]),
    ),
  );
}

function committedText(target, file) {
  const text = readFileSync(target, 'utf8');
  return JSON_FILE.test(file) ? JSON.stringify(JSON.parse(text)) : text;
}

/** The files of `referenceFiles` whose committed copy is missing or says something else. */
export function staleReferenceFiles(repositoryRoot, generated) {
  return [...generated]
    .filter(([file, text]) => {
      const target = insideRepository(repositoryRoot, file);
      return !existsSync(target) || committedText(target, file) !== text;
    })
    .map(([file]) => file);
}
