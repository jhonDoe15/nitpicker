import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jvmRuleEntries } from '../../languages/java/reference/index.mjs';
import { pythonRuleEntries } from '../../languages/python/reference/index.mjs';
import { typescriptRuleEntries } from '../../languages/typescript/reference/index.mjs';
import { sharedCheckEntries } from '../../shared/reference/checks/check-entries.mjs';
import { typescriptCheckEntries } from '../../shared/reference/checks/other-entries.mjs';
import { PAGE_IDS } from '../../shared/reference/pages.mjs';
import { coreRuleEntries } from './config-entries.mjs';

const NOT_SLUG = /[^\p{L}\p{N}\s-]/gu;

function duplicates(values) {
  const counts = Map.groupBy(values, (value) => value);
  return [...counts].filter(([, same]) => same.length > 1).map(([value]) => value);
}

/** The GitHub fragment of each heading of a Markdown text. */
function headingAnchors(text) {
  return text
    .split('\n')
    .filter((line) => /^#{1,6} /u.test(line))
    .map((line) =>
      line
        .replace(/^#+ /u, '')
        .replaceAll('`', '')
        .toLowerCase()
        .replaceAll(NOT_SLUG, '')
        .trim()
        .replaceAll(/\s/gu, '-'),
    );
}

function docsProblems(entry, repositoryRoot) {
  return (entry.docs ?? []).flatMap(({ path: docsPath, anchor }) => {
    const file = path.resolve(repositoryRoot, docsPath);
    if (!file.startsWith(repositoryRoot + path.sep)) {
      return [`${entry.id}: ${docsPath} is outside the repository`];
    }
    if (!existsSync(file)) {
      return [`${entry.id}: ${docsPath} does not exist`];
    }
    return anchor === undefined || headingAnchors(readFileSync(file, 'utf8')).includes(anchor)
      ? []
      : [`${entry.id}: ${docsPath} has no heading #${anchor}`];
  });
}

/** The problems of a set of entries: duplicate ids or anchors, unknown pages, broken guide links. */
export function entryProblems(entries, repositoryRoot) {
  return [
    ...duplicates(entries.map(({ id }) => id)).map((id) => `duplicate id ${id}`),
    ...duplicates(entries.map(({ anchor }) => anchor)).map(
      (anchor) => `duplicate anchor ${anchor}`,
    ),
    ...entries
      .filter(({ page }) => !PAGE_IDS.includes(page))
      .map(({ id, page }) => `${id}: unknown page ${String(page)}`),
    ...entries.flatMap((entry) => docsProblems(entry, repositoryRoot)),
  ];
}

/** Every entry of the reference, read from the rule catalogs, sorted by id. */
export function buildReference(repositoryRoot) {
  const entries = [
    ...sharedCheckEntries(),
    ...typescriptCheckEntries(),
    ...coreRuleEntries(),
    ...typescriptRuleEntries(),
    ...jvmRuleEntries(),
    ...pythonRuleEntries(),
  ].toSorted((a, b) => a.id.localeCompare(b.id));
  const problems = entryProblems(entries, repositoryRoot);
  if (problems.length > 0) {
    throw new Error(`The rule reference has problems:\n${problems.join('\n')}`);
  }
  return entries;
}
