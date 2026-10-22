import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const NITPICKER_CONFIG = path.resolve(import.meta.dirname, '../../../detekt/nitpicker-detekt.yml');
const LISTS_FILE = 'build/nitpicker/detekt-lists.yml';
const SIGNATURE = /^[^()\s]+(?:\([^()]*\))?$/u;
const IMPORT = /^[\w.*`]+$/u;
const ANNOTATION = /^[\w.*]+$/u;

export const MERGED_LISTS = [
  { ruleset: 'style', rule: 'ForbiddenMethodCall', list: 'methods', valid: SIGNATURE },
  { ruleset: 'style', rule: 'ForbiddenImport', list: 'imports', valid: IMPORT },
  { ruleset: 'style', rule: 'ForbiddenComment', list: 'comments', valid: /\S/u },
  {
    ruleset: 'style',
    rule: 'UseDataClass',
    list: 'excludeAnnotatedClasses',
    valid: ANNOTATION,
    plain: true,
  },
];
const [METHODS] = MERGED_LISTS;

function yaml() {
  return createRequire(import.meta.url)('yaml');
}

function parseOrEmpty(text) {
  try {
    return yaml().parse(text) ?? {};
  } catch {
    return {};
  }
}

function entryOf(raw, { valid, plain }) {
  const value = typeof raw === 'string' ? raw : raw?.value;
  if (typeof value !== 'string' || value.trim() !== value || !valid.test(value)) {
    return undefined;
  }
  if (plain) {
    return typeof raw === 'string' ? { value } : undefined;
  }
  return typeof raw.reason === 'string' ? { value, reason: raw.reason } : { value };
}

function entriesIn(config, list) {
  const entries = config?.[list.ruleset]?.[list.rule]?.[list.list];
  return Array.isArray(entries)
    ? entries.map((raw) => entryOf(raw, list)).filter((entry) => entry !== undefined)
    : [];
}

export function listEntriesOf(text, list) {
  return entriesIn(parseOrEmpty(text), list);
}

export function forbiddenMethodsOf(text) {
  return listEntriesOf(text, METHODS);
}

export function mergeForbiddenMethods(nitpickerEntries, projectEntries) {
  const owned = new Set(nitpickerEntries.map(({ value }) => value));
  const added = new Map();
  for (const entry of projectEntries) {
    if (!owned.has(entry.value) && !added.has(entry.value)) {
      added.set(entry.value, entry);
    }
  }
  return { merged: [...nitpickerEntries, ...added.values()], added: added.size };
}

function written(list, entries) {
  return list.plain ? entries.map(({ value }) => value) : entries;
}

export function writeDetektLists(projectRoot, projectConfigPath) {
  const nitpicker = parseOrEmpty(readFileSync(NITPICKER_CONFIG, 'utf8'));
  const project = parseOrEmpty(readFileSync(projectConfigPath, 'utf8'));
  const lists = {};
  for (const list of MERGED_LISTS) {
    const { merged, added } = mergeForbiddenMethods(
      entriesIn(nitpicker, list),
      entriesIn(project, list),
    );
    if (added > 0) {
      lists[list.ruleset] ??= {};
      lists[list.ruleset][list.rule] = { [list.list]: written(list, merged) };
    }
  }
  if (Object.keys(lists).length === 0) {
    return undefined;
  }
  const target = path.join(projectRoot, LISTS_FILE);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, yaml().stringify(lists));
  return target;
}
