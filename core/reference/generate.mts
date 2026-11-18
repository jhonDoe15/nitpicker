import { existsSync, readFileSync } from 'node:fs';
import * as prettier from 'prettier';
import { encodePage, REFERENCE_DATA_DIRECTORY } from '../../shared/reference/store.mjs';
import { containedPath as untypedContainedPath } from '../../shared/paths/contained-path.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { buildReference } from './build.mts';
import { renderReference } from './render.mts';
import type { FixSources, ReferenceEntry } from './build.mts';

const containedPath: (
  root: string,
  relative: string,
  options: { readonly outside: (relative: string) => string },
) => string = untypedContainedPath;
const pageData: (entries: readonly ReferenceEntry[]) => unknown = encodePage;
const dataDirectory: string = REFERENCE_DATA_DIRECTORY;
const pageIds: readonly { readonly id: string }[] = PAGES;
const parseJson: (text: string) => unknown = JSON.parse;

export {
  installedRuffRules,
  isOlderVersion,
  withSelectedNewerRules,
} from '../../languages/python/reference/ruff-selection.mts';
export {
  readRuffSnapshot,
  RUFF_RULES_FILE,
} from '../../languages/python/reference/ruff-entries.mts';
export {
  liveToolText,
  TOOL_TEXT_TOOLS,
  toolTextFile,
} from '../../languages/java/reference/tool-text/tool-text.mts';
export {
  liveEslintInventory,
  writeEslintInventory,
} from '../../languages/typescript/reference/eslint-inventory.mts';

const JSON_FILE = /\.json$/u;

function insideRepository(repositoryRoot: string, file: string): string {
  return containedPath(repositoryRoot, file, {
    outside: (relative) => `The generated file ${relative} is outside the repository`,
  });
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
