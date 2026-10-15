import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const NITPICKER_CONFIG = path.resolve(import.meta.dirname, '../../detekt/nitpicker-detekt.yml');
const LISTS_FILE = 'build/nitpicker/detekt-lists.yml';
const RULESET = 'style';
const RULE = 'ForbiddenMethodCall';
const LIST = 'methods';

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

const SIGNATURE = /^[^()\s]+(?:\([^()]*\))?$/u;

function entryOf(raw) {
  const value = typeof raw === 'string' ? raw : raw?.value;
  if (typeof value !== 'string' || !SIGNATURE.test(value)) {
    return undefined;
  }
  return typeof raw.reason === 'string' ? { value, reason: raw.reason } : { value };
}

export function forbiddenMethodsOf(text) {
  return entriesIn(parseOrEmpty(text));
}

function entriesIn(config) {
  const list = config?.[RULESET]?.[RULE]?.[LIST];
  return Array.isArray(list) ? list.map(entryOf).filter((entry) => entry !== undefined) : [];
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

export function writeDetektLists(projectRoot, projectConfigPath) {
  const nitpicker = forbiddenMethodsOf(readFileSync(NITPICKER_CONFIG, 'utf8'));
  const project = forbiddenMethodsOf(readFileSync(projectConfigPath, 'utf8'));
  const { merged, added } = mergeForbiddenMethods(nitpicker, project);
  if (added === 0) {
    return undefined;
  }
  const target = path.join(projectRoot, LISTS_FILE);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, yaml().stringify({ [RULESET]: { [RULE]: { [LIST]: merged } } }));
  return target;
}
