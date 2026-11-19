import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fieldOf } from '../../../../../shared/values/readers.mts';

const NITPICKER_CONFIG = path.resolve(import.meta.dirname, '../../../detekt/nitpicker-detekt.yml');
const LISTS_FILE = 'build/nitpicker/detekt-lists.yml';
const STYLE = 'style';
const SIGNATURE = /^[^()\s]+(?:\([^()]*\))?$/u;
const IMPORT = /^[\w.*`]+$/u;
const ANNOTATION = /^[\w.*]+$/u;

export type ListSpec = {
  ruleset: string;
  rule: string;
  list: string;
  valid: RegExp;
  plain?: true;
};

export type ListEntry = { value: string; reason?: string };

type Yaml = { parse: (text: string) => unknown; stringify: (value: unknown) => string };

const METHODS: ListSpec = {
  ruleset: STYLE,
  rule: 'ForbiddenMethodCall',
  list: 'methods',
  valid: SIGNATURE,
};

export const MERGED_LISTS: [ListSpec, ListSpec, ListSpec, ListSpec] = [
  METHODS,
  { ruleset: STYLE, rule: 'ForbiddenImport', list: 'imports', valid: IMPORT },
  { ruleset: STYLE, rule: 'ForbiddenComment', list: 'comments', valid: /\S/u },
  {
    ruleset: STYLE,
    rule: 'UseDataClass',
    list: 'excludeAnnotatedClasses',
    valid: ANNOTATION,
    plain: true,
  },
];

function isYaml(value: unknown): value is Yaml {
  return (
    typeof fieldOf(value, 'parse') === 'function' &&
    typeof fieldOf(value, 'stringify') === 'function'
  );
}

function yaml(): Yaml {
  const loaded: unknown = createRequire(import.meta.url)('yaml');
  if (!isYaml(loaded)) {
    throw new TypeError('yaml module is unusable');
  }
  return loaded;
}

function parseOrEmpty(text: string): unknown {
  try {
    return yaml().parse(text) ?? {};
  } catch {
    return {};
  }
}

function entryOf(raw: unknown, { valid, plain }: ListSpec): ListEntry | undefined {
  const value = typeof raw === 'string' ? raw : fieldOf(raw, 'value');
  if (typeof value !== 'string' || value.trim() !== value || !valid.test(value)) {
    return undefined;
  }
  if (plain) {
    return typeof raw === 'string' ? { value } : undefined;
  }
  const reason = fieldOf(raw, 'reason');
  return typeof reason === 'string' ? { value, reason } : { value };
}

function entriesIn(config: unknown, list: ListSpec): ListEntry[] {
  const entries = fieldOf(fieldOf(fieldOf(config, list.ruleset), list.rule), list.list);
  return Array.isArray(entries)
    ? entries
        .map((raw: unknown) => entryOf(raw, list))
        .filter((entry): entry is ListEntry => entry !== undefined)
    : [];
}

export function listEntriesOf(text: string, list: ListSpec): ListEntry[] {
  return entriesIn(parseOrEmpty(text), list);
}

export function forbiddenMethodsOf(text: string): ListEntry[] {
  return listEntriesOf(text, METHODS);
}

export function mergeForbiddenMethods(
  nitpickerEntries: ListEntry[],
  projectEntries: ListEntry[],
): { merged: ListEntry[]; added: number } {
  const owned = new Set(nitpickerEntries.map(({ value }) => value));
  const added = new Map<string, ListEntry>();
  for (const entry of projectEntries) {
    if (!(owned.has(entry.value) || added.has(entry.value))) {
      added.set(entry.value, entry);
    }
  }
  return { merged: [...nitpickerEntries, ...added.values()], added: added.size };
}

function written(list: ListSpec, entries: ListEntry[]): unknown[] {
  return list.plain ? entries.map(({ value }) => value) : entries;
}

export function writeDetektLists(
  projectRoot: string,
  projectConfigPath: string,
  target = path.join(projectRoot, LISTS_FILE),
): string | undefined {
  const nitpicker = parseOrEmpty(readFileSync(NITPICKER_CONFIG, 'utf8'));
  const project = parseOrEmpty(readFileSync(projectConfigPath, 'utf8'));
  const lists: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const list of MERGED_LISTS) {
    const { merged, added } = mergeForbiddenMethods(
      entriesIn(nitpicker, list),
      entriesIn(project, list),
    );
    if (added > 0) {
      const ruleset = lists[list.ruleset] ?? {};
      lists[list.ruleset] = ruleset;
      ruleset[list.rule] = { [list.list]: written(list, merged) };
    }
  }
  if (Object.keys(lists).length === 0) {
    return undefined;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, yaml().stringify(lists));
  return target;
}
