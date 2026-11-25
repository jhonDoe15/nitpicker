import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docsRootUrl } from '../messages/docs-url.mts';
import { repositoryUrl } from './facts.mts';
import { ruleEntry } from './entry.mts';
import { PAGE_IDS } from './pages.mts';
import { TOOL_TIMEOUT_MS } from '../processes/deadlines.mts';
import { smallest as untypedSmallest } from '../lists/items.mjs';
import { fieldOf } from '../values/readers.mts';
import { isEncodedPage, isEntryFields } from './typed/entry-fields.mts';
import type {
  EncodedPage,
  EntryIndex,
  FindingKey,
  HelpedFinding,
  ReferenceLinks,
  RuleEntry,
  StoredEntry,
} from './typed/entry-types.mts';

const smallest: (values: readonly number[]) => number = untypedSmallest;

export const REFERENCE_DATA_DIRECTORY = 'shared/reference/rules';
const REFERENCE_DATA = new URL('./rules/', import.meta.url);
const GENERATOR = new URL('../../scripts/reference/gen-rules.mjs', import.meta.url);
const DERIVED_FIELDS = ['id', 'anchor', 'page'];
const ABSENT = -1;

const FIRST_RESULTS = 5;
const MINIMUM_DISTANCE = 3;
const DISTANCE_DIVISOR = 3;
const MINIMUM_KEY = 6;

function valueTable(): { values: unknown[]; indexOf: (value: unknown) => number } {
  const values: unknown[] = [];
  const indexes = new Map<string, number>();
  function indexOf(value: unknown): number {
    const key = JSON.stringify(value);
    const known = indexes.get(key);
    if (known !== undefined) {
      return known;
    }
    indexes.set(key, values.length);
    values.push(value);
    return values.length - 1;
  }
  return { values, indexOf };
}

export function encodePage(entries: readonly Readonly<Record<string, unknown>>[]): {
  fields: string[];
  values: unknown[];
  entries: number[][];
} {
  const { values, indexOf } = valueTable();
  const fields = [...new Set(entries.flatMap(Object.keys))].filter(
    (field) => !DERIVED_FIELDS.includes(field),
  );
  return {
    fields,
    values,
    entries: entries.map((entry) =>
      fields.map((field) => {
        const value = fieldOf(entry, field);
        return value === undefined ? ABSENT : indexOf(value);
      }),
    ),
  };
}

export function decodePage(page: string, { fields, values, entries }: EncodedPage): StoredEntry[] {
  return entries.map((row) => {
    const present = fields.flatMap((field, column): [string, unknown][] => {
      const valueIndex = row[column];
      return valueIndex === undefined || valueIndex === ABSENT ? [] : [[field, values[valueIndex]]];
    });
    const fieldsOfEntry = Object.fromEntries(present);
    if (!isEntryFields(fieldsOfEntry)) {
      throw new Error(`The reference data of ${page} holds an entry without its required fields`);
    }
    return { ...ruleEntry(fieldsOfEntry), page };
  });
}

function missingDataFiles(): boolean {
  return PAGE_IDS.some((page) => !existsSync(new URL(`${page}.json`, REFERENCE_DATA)));
}

function buildMissingDataInCheckout(): void {
  if (!(missingDataFiles() && existsSync(GENERATOR))) {
    return;
  }
  const result = spawnSync(process.execPath, [fileURLToPath(GENERATOR), '--data'], {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: TOOL_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(
      `Building the rule reference failed (npm run gen:rules -- --data): ${result.error?.message ?? result.stderr}`,
    );
  }
}

function readPageData(page: string): EncodedPage {
  const file = new URL(`${page}.json`, REFERENCE_DATA);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read the reference data of ${page}`, { cause: error });
  }
  if (!isEncodedPage(data)) {
    throw new Error(`The reference data of ${page} is not an encoded page`);
  }
  return data;
}

export function readReferenceEntries(): StoredEntry[] {
  buildMissingDataInCheckout();
  return PAGE_IDS.flatMap((page) => decodePage(page, readPageData(page))).toSorted((a, b) =>
    a.id.localeCompare(b.id),
  );
}

function keysOf(entry: RuleEntry): string[] {
  const tools = [entry.tool, ...(entry.findingTools ?? [])];
  const last = entry.rule.split('.').at(-1);
  return [
    ...tools.map((tool) => `${tool}/${entry.rule}`),
    ...(entry.pattern === undefined ? [entry.rule] : []),
    ...(entry.pattern === undefined && entry.rule.includes('.') && last !== undefined
      ? [last]
      : []),
  ];
}

function addKey(map: Map<string, RuleEntry[]>, key: string, entry: RuleEntry): void {
  const entries = map.get(key) ?? [];
  map.set(key, [...entries, entry]);
}

export function indexEntries(entries: readonly RuleEntry[]): EntryIndex {
  const exact = new Map<string, RuleEntry[]>();
  const lowercase = new Map<string, RuleEntry[]>();
  for (const entry of entries) {
    for (const key of keysOf(entry)) {
      addKey(exact, key, entry);
      addKey(lowercase, key.toLowerCase(), entry);
    }
  }
  return {
    entries,
    exact,
    lowercase,
    patterns: entries.flatMap((entry) =>
      entry.pattern === undefined ? [] : [{ entry, expression: new RegExp(entry.pattern, 'u') }],
    ),
  };
}

function patternMatches(index: EntryIndex, tool: string, rule: string): RuleEntry[] {
  return index.patterns
    .filter(
      ({ entry, expression }) =>
        (entry.tool === tool || (entry.findingTools ?? []).includes(tool)) && expression.test(rule),
    )
    .map(({ entry }) => entry);
}

export function entryForFinding(
  index: EntryIndex,
  { tool, rule }: FindingKey,
): RuleEntry | undefined {
  const matches = index.exact.get(`${tool}/${rule}`) ?? patternMatches(index, tool, rule);
  return matches[0];
}

function byPattern(index: EntryIndex, text: string): readonly RuleEntry[] {
  const slash = text.indexOf('/');
  const withTool =
    slash === -1 ? [] : patternMatches(index, text.slice(0, slash), text.slice(slash + 1));
  const bare = index.patterns
    .filter(({ entry, expression }) => entry.barePattern === true && expression.test(text))
    .map(({ entry }) => entry);
  return [...withTool, ...bare];
}

export function lookupEntries(index: EntryIndex, query: string): RuleEntry[] {
  const text = query.trim();
  const found =
    index.exact.get(text) ?? index.lowercase.get(text.toLowerCase()) ?? byPattern(index, text);
  return [...new Set(found)];
}

function cell(row: readonly number[], index: number): number {
  return row[index] ?? Number.NaN;
}

export function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [row, leftCharacter] of Array.from(left).entries()) {
    const current = [row + 1];
    for (const [column, rightCharacter] of Array.from(right).entries()) {
      const substitution = cell(previous, column) + (leftCharacter === rightCharacter ? 0 : 1);
      current.push(
        Math.min(substitution, cell(previous, column + 1) + 1, cell(current, column) + 1),
      );
    }
    previous = current;
  }
  return cell(previous, right.length);
}

function nearness(query: string, key: string): number {
  const lowered = key.toLowerCase();
  const contained =
    lowered.includes(query) || (lowered.length >= MINIMUM_KEY && query.includes(lowered));
  return contained
    ? 0
    : Math.min(distance(query, lowered), distance(query, lowered.slice(0, query.length)));
}

export function closestIds(
  index: EntryIndex,
  query: string,
  limit: number = FIRST_RESULTS,
): string[] {
  const text = query.trim().toLowerCase();
  const tolerance = Math.max(MINIMUM_DISTANCE, Math.floor(text.length / DISTANCE_DIVISOR));
  const scored = index.entries
    .map((entry) => ({
      id: entry.id,
      score: smallest(keysOf(entry).map((key) => nearness(text, key))),
    }))
    .filter(({ score }) => score <= tolerance)
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map(({ id }) => id);
}

export function referenceUrl(
  entry: { readonly page?: string | undefined; readonly anchor: string },
  root: string | undefined,
): string | undefined {
  return entry.page === undefined
    ? undefined
    : repositoryUrl(`docs/rules/${entry.page}.md`, entry.anchor, root);
}

export function referenceLinks(): ReferenceLinks {
  const loaded: { index?: EntryIndex; root?: string | undefined } = {};
  return {
    index() {
      loaded.index ??= indexEntries(readReferenceEntries());
      return loaded.index;
    },
    root() {
      if (!Object.hasOwn(loaded, 'root')) {
        loaded.root = docsRootUrl();
      }
      return loaded.root;
    },
  };
}

export function helpUriFor(links: ReferenceLinks, finding: FindingKey): string | undefined {
  const entry = entryForFinding(links.index(), finding);
  return entry === undefined ? undefined : referenceUrl(entry, links.root());
}

export function withHelpUris<Finding extends HelpedFinding>(
  findings: readonly Finding[],
  links: ReferenceLinks = referenceLinks(),
): readonly Finding[] {
  if (findings.length === 0) {
    return findings;
  }
  return findings.map((finding) => {
    const helpUri = finding.helpUri ?? helpUriFor(links, finding);
    return helpUri === undefined ? finding : { ...finding, helpUri };
  });
}
