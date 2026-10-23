import { readFileSync } from 'node:fs';
import { docsUrl } from '../messages/docs-url.mjs';
import { PAGE_IDS } from './pages.mjs';

/** Where the entries are kept, one JSON file per page, relative to the repository root. */
export const REFERENCE_DATA_DIRECTORY = 'shared/reference/rules';
const REFERENCE_DATA = new URL('./rules/', import.meta.url);

const FIRST_RESULTS = 5;
const MINIMUM_DISTANCE = 3;
const DISTANCE_DIVISOR = 3;
const MINIMUM_KEY = 6;

/** The committed entries, read from the data file of each page, sorted by id. */
export function readReferenceEntries() {
  return PAGE_IDS.flatMap((page) =>
    JSON.parse(readFileSync(new URL(`${page}.json`, REFERENCE_DATA), 'utf8')),
  ).toSorted((a, b) => a.id.localeCompare(b.id));
}

function keysOf(entry) {
  const tools = [entry.tool, ...(entry.findingTools ?? [])];
  return [
    ...tools.map((tool) => `${tool}/${entry.rule}`),
    ...(entry.pattern === undefined ? [entry.rule] : []),
  ];
}

function addKey(map, key, entry) {
  const entries = map.get(key) ?? [];
  map.set(key, [...entries, entry]);
}

/** An index over `entries` that finds an entry by the rule a finding prints or a name typed by hand. */
export function indexEntries(entries) {
  const exact = new Map();
  const lowercase = new Map();
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
    patterns: entries
      .filter((entry) => entry.pattern !== undefined)
      .map((entry) => ({ entry, expression: new RegExp(entry.pattern, 'u') })),
  };
}

function patternMatches(index, tool, rule) {
  return index.patterns
    .filter(
      ({ entry, expression }) =>
        (entry.tool === tool || (entry.findingTools ?? []).includes(tool)) && expression.test(rule),
    )
    .map(({ entry }) => entry);
}

/** The entry of the rule a finding prints, if the reference has one. */
export function entryForFinding(index, { tool, rule }) {
  const matches = index.exact.get(`${tool}/${rule}`) ?? patternMatches(index, tool, rule);
  return matches[0];
}

function byPattern(index, text) {
  const slash = text.indexOf('/');
  const withTool =
    slash === -1 ? [] : patternMatches(index, text.slice(0, slash), text.slice(slash + 1));
  const bare = index.patterns
    .filter(({ entry, expression }) => entry.barePattern === true && expression.test(text))
    .map(({ entry }) => entry);
  return [...withTool, ...bare];
}

/** The entries a name typed by hand stands for: `tool/rule` as a finding prints it, or a bare rule. */
export function lookupEntries(index, query) {
  const text = query.trim();
  const found =
    index.exact.get(text) ?? index.lowercase.get(text.toLowerCase()) ?? byPattern(index, text);
  return [...new Set(found)];
}

function distance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [row, leftCharacter] of [...left].entries()) {
    const current = [row + 1];
    for (const [column, rightCharacter] of [...right].entries()) {
      const substitution = previous[column] + (leftCharacter === rightCharacter ? 0 : 1);
      current.push(Math.min(substitution, previous[column + 1] + 1, current[column] + 1));
    }
    previous = current;
  }
  return previous[right.length];
}

function nearness(query, key) {
  const lowered = key.toLowerCase();
  const contained =
    lowered.includes(query) || (lowered.length >= MINIMUM_KEY && query.includes(lowered));
  return contained
    ? 0
    : Math.min(distance(query, lowered), distance(query, lowered.slice(0, query.length)));
}

/** The ids of the entries closest to a name nobody knows, nearest first. */
export function closestIds(index, query, limit = FIRST_RESULTS) {
  const text = query.trim().toLowerCase();
  const tolerance = Math.max(MINIMUM_DISTANCE, Math.floor(text.length / DISTANCE_DIVISOR));
  const scored = index.entries
    .map((entry) => ({
      id: entry.id,
      score: Math.min(...keysOf(entry).map((key) => nearness(text, key))),
    }))
    .filter(({ score }) => score <= tolerance)
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map(({ id }) => id);
}

/** The link to a rule's entry in the reference on GitHub. */
export function referenceUrl(entry) {
  return docsUrl(`docs/rules/${entry.page}.md`, entry.anchor);
}

/** The index over the committed entries. */
export function readReferenceIndex() {
  return indexEntries(readReferenceEntries());
}

/** The link to the reference entry of the rule a finding prints, or undefined when there is none. */
export function helpUriFor(index, finding) {
  const entry = entryForFinding(index, finding);
  return entry === undefined ? undefined : referenceUrl(entry);
}

/** `findings` with a `helpUri` on each one that has none and whose rule the reference knows. */
export function withHelpUris(findings) {
  if (findings.length === 0) {
    return findings;
  }
  const index = readReferenceIndex();
  return findings.map((finding) => {
    const helpUri = finding.helpUri ?? helpUriFor(index, finding);
    return helpUri === undefined ? finding : { ...finding, helpUri };
  });
}
