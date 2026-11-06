import { readFileSync } from 'node:fs';
import { docsRootUrl } from '../messages/docs-url.mjs';
import { repositoryUrl } from './facts.mjs';
import { ruleEntry } from './entry.mjs';
import { PAGE_IDS } from './pages.mjs';

/** Where the entries are kept, one JSON file per page, relative to the repository root. */
export const REFERENCE_DATA_DIRECTORY = 'shared/reference/rules';
const REFERENCE_DATA = new URL('./rules/', import.meta.url);
const DERIVED_FIELDS = ['id', 'anchor', 'page'];
const ABSENT = -1;

const FIRST_RESULTS = 5;
const MINIMUM_DISTANCE = 3;
const DISTANCE_DIVISOR = 3;
const MINIMUM_KEY = 6;

function valueTable() {
  const values = [];
  const indexes = new Map();
  function indexOf(value) {
    const key = JSON.stringify(value);
    if (!indexes.has(key)) {
      indexes.set(key, values.length);
      values.push(value);
    }
    return indexes.get(key);
  }
  return { values, indexOf };
}

/**
 * The data file of a page: each distinct field value once, in `values`, the field names, in
 * `fields`, and each entry as a row of value indexes, one per field, -1 where the entry has none.
 * The fields that follow from the others (`id`, `anchor`, `page`) are left out.
 */
export function encodePage(entries) {
  const { values, indexOf } = valueTable();
  const fields = [...new Set(entries.flatMap(Object.keys))].filter(
    (field) => !DERIVED_FIELDS.includes(field),
  );
  return {
    fields,
    values,
    entries: entries.map((entry) =>
      fields.map((field) => (entry[field] === undefined ? ABSENT : indexOf(entry[field]))),
    ),
  };
}

/** The entries of a page's data file. */
export function decodePage(page, { fields, values, entries }) {
  return entries.map((row) => {
    const present = fields.flatMap((field, column) =>
      row[column] === ABSENT ? [] : [[field, values[row[column]]]],
    );
    return { ...ruleEntry(Object.fromEntries(present)), page };
  });
}

/** The committed entries, read from the data file of each page, sorted by id. */
export function readReferenceEntries() {
  return PAGE_IDS.flatMap((page) =>
    decodePage(page, JSON.parse(readFileSync(new URL(`${page}.json`, REFERENCE_DATA), 'utf8'))),
  ).toSorted((a, b) => a.id.localeCompare(b.id));
}

function keysOf(entry) {
  const tools = [entry.tool, ...(entry.findingTools ?? [])];
  return [
    ...tools.map((tool) => `${tool}/${entry.rule}`),
    ...(entry.pattern === undefined ? [entry.rule] : []),
    ...(entry.pattern === undefined && entry.rule.includes('.')
      ? [entry.rule.split('.').at(-1)]
      : []),
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

/**
 * The link to a rule's entry in the reference on GitHub, under `root` (see `docsRootUrl`), or
 * undefined without a root.
 */
export function referenceUrl(entry, root) {
  return repositoryUrl(`docs/rules/${entry.page}.md`, entry.anchor, root);
}

/**
 * The rule reference as one run uses it: `index()` over the committed entries and the `root()` of
 * its links, each read on first use and kept for the later calls on this object.
 */
export function referenceLinks() {
  const loaded = {};
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

/** The link to the reference entry of the rule a finding prints, or undefined when there is none. */
export function helpUriFor(links, finding) {
  const entry = entryForFinding(links.index(), finding);
  return entry === undefined ? undefined : referenceUrl(entry, links.root());
}

/** `findings` with a `helpUri` on each one that has none and whose rule the reference knows. */
export function withHelpUris(findings, links = referenceLinks()) {
  if (findings.length === 0) {
    return findings;
  }
  return findings.map((finding) => {
    const helpUri = finding.helpUri ?? helpUriFor(links, finding);
    return helpUri === undefined ? finding : { ...finding, helpUri };
  });
}
