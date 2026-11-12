import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jvmRuleEntries } from '../../languages/java/reference/index.mts';
import { pythonRuleEntries } from '../../languages/python/reference/index.mts';
import { typescriptRuleEntries } from '../../languages/typescript/reference/index.mts';
import { sharedCheckEntries } from '../../shared/reference/checks/check-entries.mjs';
import { typescriptCheckEntries } from '../../shared/reference/checks/other-entries.mjs';
import { PAGE_IDS } from '../../shared/reference/pages.mjs';
import { coreRuleEntries } from './config-entries.mts';
import { guideLink, headingAnchors } from '../../shared/reference/build/guide-pages.mjs';

function duplicates(values) {
  const counts = Map.groupBy(values, (value) => value);
  return [...counts].filter(([, same]) => same.length > 1).map(([value]) => value);
}

const RULE_PAGES = 'docs/rules/';

function rulePageProblems(entry, { path: docsPath, anchor }, ruleTargets) {
  const target = anchor === undefined ? docsPath : `${docsPath}#${anchor}`;
  return ruleTargets.has(target) ? [] : [`${entry.id}: the reference has no ${target}`];
}

function docsProblems(entry, repositoryRoot, ruleTargets) {
  return (entry.docs ?? []).flatMap(({ path: docsPath, anchor }) => {
    if (docsPath.startsWith(RULE_PAGES)) {
      return rulePageProblems(entry, { path: docsPath, anchor }, ruleTargets);
    }
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

function ruleTargets(entries) {
  return new Set([
    `${RULE_PAGES}README.md`,
    ...PAGE_IDS.map((page) => `${RULE_PAGES}${page}.md`),
    ...entries.map(({ page, anchor }) => `${RULE_PAGES}${page}.md#${anchor}`),
  ]);
}

/** The problems of a set of entries: duplicate ids or anchors, unknown pages, broken guide links. */
export function entryProblems(entries, repositoryRoot) {
  const targets = ruleTargets(entries);
  return [
    ...duplicates(entries.map(({ id }) => id)).map((id) => `duplicate id ${id}`),
    ...duplicates(entries.map(({ anchor }) => anchor)).map(
      (anchor) => `duplicate anchor ${anchor}`,
    ),
    ...entries
      .filter(({ page }) => !PAGE_IDS.includes(page))
      .map(({ id, page }) => `${id}: unknown page ${String(page)}`),
    ...entries.flatMap((entry) => docsProblems(entry, repositoryRoot, targets)),
  ];
}

function withGuidePages(entry) {
  if (entry.docs === undefined) {
    return entry;
  }
  return {
    ...entry,
    docs: entry.docs.map((doc) => {
      const { path: guide, anchor, ...link } = doc;
      if (guide === undefined) {
        return link;
      }
      return guide.startsWith(RULE_PAGES) ? doc : { ...link, ...guideLink(guide, anchor) };
    }),
  };
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
  ]
    .map(withGuidePages)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const problems = entryProblems(entries, repositoryRoot);
  if (problems.length > 0) {
    throw new Error(`The rule reference has problems:\n${problems.join('\n')}`);
  }
  return entries;
}
