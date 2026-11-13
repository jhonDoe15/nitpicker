import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { encodePage, REFERENCE_DATA_DIRECTORY } from '../../shared/reference/store.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { buildReference } from './build.mts';
import { renderReference } from './render.mts';
import type { FixSources, ReferenceEntry } from './build.mts';

const pageData: (entries: readonly ReferenceEntry[]) => unknown = encodePage;
const dataDirectory: string = REFERENCE_DATA_DIRECTORY;
const pageIds: readonly { readonly id: string }[] = PAGES;
const parseJson: (text: string) => unknown = JSON.parse;

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

function insideRepository(repositoryRoot: string, file: string): string {
  const target = path.resolve(repositoryRoot, file);
  if (!target.startsWith(repositoryRoot + path.sep)) {
    throw new Error(`The generated file ${file} is outside the repository`);
  }
  return target;
}

export async function formattedText(
  repositoryRoot: string,
  file: string,
  text: string,
): Promise<string> {
  const target = insideRepository(repositoryRoot, file);
  const options = (await prettier.resolveConfig(target)) ?? {};
  return prettier.format(text, { ...options, filepath: target });
}

function dataFiles(entries: readonly ReferenceEntry[]): [string, string][] {
  const byPage = Map.groupBy(entries, ({ page }) => page);
  return pageIds.map(({ id }) => [
    `${dataDirectory}/${id}.json`,
    JSON.stringify(pageData(byPage.get(id) ?? [])),
  ]);
}

export function referenceDataFiles(
  repositoryRoot: string,
  fixSources?: FixSources,
): Map<string, string> {
  return new Map(dataFiles(buildReference(repositoryRoot, fixSources)));
}

export function referenceFiles(
  repositoryRoot: string,
  fixSources?: FixSources,
): Map<string, string> {
  const entries = buildReference(repositoryRoot, fixSources);
  return new Map([...dataFiles(entries), ...renderReference(entries)]);
}

function committedText(target: string, file: string): string {
  const text = readFileSync(target, 'utf8');
  return JSON_FILE.test(file) ? JSON.stringify(parseJson(text)) : text;
}

export function staleReferenceFiles(
  repositoryRoot: string,
  generated: ReadonlyMap<string, string>,
): string[] {
  return [...generated]
    .filter(([file, text]) => {
      const target = insideRepository(repositoryRoot, file);
      return !existsSync(target) || committedText(target, file) !== text;
    })
    .map(([file]) => file);
}
