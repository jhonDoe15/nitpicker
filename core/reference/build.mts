import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jvmRuleEntries } from '../../languages/java/reference/index.mjs';
import { pythonRuleEntries } from '../../languages/python/reference/index.mjs';
import { typescriptRuleEntries } from '../../languages/typescript/reference/index.mjs';
import { sharedCheckEntries } from '../../shared/reference/checks/check-entries.mjs';
import { typescriptCheckEntries } from '../../shared/reference/checks/other-entries.mjs';
import { PAGE_IDS } from '../../shared/reference/pages.mjs';
import { coreRuleEntries } from './config-entries.mts';
import { withFixStatus, DEFAULT_FIX_SOURCES } from '../fix/status/fix-status.mjs';
import { guideLink, headingAnchors } from '../../shared/reference/build/guide-pages.mjs';
import { fieldOf, listOf, textOf } from '../../shared/values/readers.mts';

export type ReferenceEntry = Readonly<Record<string, unknown>>;

export type FixSources = typeof DEFAULT_FIX_SOURCES;

type Entries = () => readonly ReferenceEntry[];

const sharedChecks: Entries = sharedCheckEntries;
const typescriptChecks: Entries = typescriptCheckEntries;
const typescriptRules: Entries = typescriptRuleEntries;
const jvmRules: Entries = jvmRuleEntries;
const pythonRules: Entries = pythonRuleEntries;
const pageIds: readonly unknown[] = PAGE_IDS;
const anchorsOf: (text: string) => readonly unknown[] = headingAnchors;
const linkToGuide: (guide: string, anchor: unknown) => object = guideLink;

function withStatus(entry: ReferenceEntry, sources: FixSources): ReferenceEntry {
  return withFixStatus({ fixableIn: undefined, ...entry }, sources);
}

function duplicates(values: readonly unknown[]): unknown[] {
  const counts = Map.groupBy(values, (value) => value);
  return [...counts].filter(([, same]) => same.length > 1).map(([value]) => value);
}

const RULE_PAGES = 'docs/rules/';

function rulePageProblems(
  entry: ReferenceEntry,
  { path: docsPath, anchor }: { readonly path: string; readonly anchor: unknown },
  ruleTargets: ReadonlySet<string>,
): string[] {
  const target = anchor === undefined ? docsPath : `${docsPath}#${textOf(anchor)}`;
  return ruleTargets.has(target) ? [] : [`${textOf(entry['id'])}: the reference has no ${target}`];
}

function docsProblems(
  entry: ReferenceEntry,
  repositoryRoot: string,
  ruleTargets: ReadonlySet<string>,
): string[] {
  const id = textOf(entry['id']);
  return listOf(entry['docs']).flatMap((doc) => {
    const docsPath = textOf(fieldOf(doc, 'path'));
    const anchor = fieldOf(doc, 'anchor');
    if (docsPath.startsWith(RULE_PAGES)) {
      return rulePageProblems(entry, { path: docsPath, anchor }, ruleTargets);
    }
    const file = path.resolve(repositoryRoot, docsPath);
    if (!file.startsWith(repositoryRoot + path.sep)) {
      return [`${id}: ${docsPath} is outside the repository`];
    }
    if (!existsSync(file)) {
      return [`${id}: ${docsPath} does not exist`];
    }
    return anchor === undefined || anchorsOf(readFileSync(file, 'utf8')).includes(anchor)
      ? []
      : [`${id}: ${docsPath} has no heading #${textOf(anchor)}`];
  });
}

function ruleTargets(entries: readonly ReferenceEntry[]): Set<string> {
  return new Set([
    `${RULE_PAGES}README.md`,
    ...pageIds.map((page) => `${RULE_PAGES}${textOf(page)}.md`),
    ...entries.map(({ page, anchor }) => `${RULE_PAGES}${textOf(page)}.md#${textOf(anchor)}`),
  ]);
}

export function entryProblems(
  entries: readonly ReferenceEntry[],
  repositoryRoot: string,
): string[] {
  const targets = ruleTargets(entries);
  return [
    ...duplicates(entries.map(({ id }) => id)).map((id) => `duplicate id ${textOf(id)}`),
    ...duplicates(entries.map(({ anchor }) => anchor)).map(
      (anchor) => `duplicate anchor ${textOf(anchor)}`,
    ),
    ...entries
      .filter(({ page }) => !pageIds.includes(page))
      .map(({ id, page }) => `${textOf(id)}: unknown page ${String(page)}`),
    ...entries.flatMap((entry) => docsProblems(entry, repositoryRoot, targets)),
  ];
}

function withGuidePage(doc: unknown): unknown {
  const { path: guide, anchor, ...link } = fieldsOfDoc(doc);
  if (guide === undefined) {
    return link;
  }
  return textOf(guide).startsWith(RULE_PAGES)
    ? doc
    : { ...link, ...linkToGuide(textOf(guide), anchor) };
}

function fieldsOfDoc(doc: unknown): Readonly<Record<string, unknown>> {
  return typeof doc === 'object' && doc !== null ? { ...doc } : {};
}

function withGuidePages(entry: ReferenceEntry): ReferenceEntry {
  if (entry['docs'] === undefined) {
    return entry;
  }
  return { ...entry, docs: listOf(entry['docs']).map(withGuidePage) };
}

export function buildReference(
  repositoryRoot: string,
  fixSources: FixSources = DEFAULT_FIX_SOURCES,
): ReferenceEntry[] {
  const entries = [
    ...sharedChecks(),
    ...typescriptChecks(),
    ...coreRuleEntries(),
    ...typescriptRules(),
    ...jvmRules(),
    ...pythonRules(),
  ]
    .map(withGuidePages)
    .map((entry) => withStatus(entry, fixSources))
    .toSorted((a, b) => textOf(a['id']).localeCompare(textOf(b['id'])));
  const problems = entryProblems(entries, repositoryRoot);
  if (problems.length > 0) {
    throw new Error(`The rule reference has problems:\n${problems.join('\n')}`);
  }
  return entries;
}
