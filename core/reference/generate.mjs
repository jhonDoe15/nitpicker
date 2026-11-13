import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { encodePage, REFERENCE_DATA_DIRECTORY } from '../../shared/reference/store.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { buildReference } from './build.mjs';
import { renderReference } from './render.mjs';

export {
  installedRuffRules,
  isOlderVersion,
  withSelectedNewerRules,
} from '../../languages/python/reference/ruff-selection.mjs';
export {
  readRuffSnapshot,
  RUFF_RULES_FILE,
} from '../../languages/python/reference/ruff-entries.mjs';
export {
  liveToolText,
  TOOL_TEXT_TOOLS,
  toolTextFile,
} from '../../languages/java/reference/tool-text/tool-text.mjs';
export {
  liveEslintInventory,
  writeEslintInventory,
} from '../../languages/typescript/reference/eslint-inventory.mjs';

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
    JSON.stringify(encodePage(byPage.get(id) ?? [])),
  ]);
}

/** The data file of each page, as compact JSON, by path relative to the repository root. */
export function referenceDataFiles(repositoryRoot) {
  return new Map(dataFiles(buildReference(repositoryRoot)));
}

/**
 * The generated files, by path relative to the repository root: the data file of each page, as
 * compact JSON, and the Markdown pages, already in the form Prettier gives them.
 */
export function referenceFiles(repositoryRoot) {
  const entries = buildReference(repositoryRoot);
  return new Map([...dataFiles(entries), ...renderReference(entries)]);
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
