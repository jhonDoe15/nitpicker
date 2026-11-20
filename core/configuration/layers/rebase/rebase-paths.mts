import { appendAll } from '../../../../shared/lists/lists.mts';
import { globMatcher as untypedGlobMatcher } from '../../../../shared/paths/glob.mjs';
import { fieldOf, fieldsOf, isPlainObject, textsOf } from '../../../../shared/values/readers.mts';

const globMatcher: (glob: string) => { test: (file: string) => boolean } = untypedGlobMatcher;

type BraceGroup = { readonly end: number; readonly commas: number[] };
type Rebaser = (value: unknown, segments: readonly string[]) => unknown;
type Segments = readonly string[];

const LAYOUT_GLOB_KEYS = new Set(['excludedGlobs', 'entryPoints', 'sharedRoots', 'featureRoots']);
const FOLDER_KEYS = new Set(['sourceRoots', 'testRoots']);
const PYTHON_GLOB_KEYS = new Set(['entryPoints']);

function braceAt(pattern: string, start: number): BraceGroup | undefined {
  let depth = 0;
  const commas: number[] = [];
  for (const [offset, character] of pattern.slice(start).split('').entries()) {
    const index = start + offset;
    const escaped = pattern[index - 1] === '\\';
    depth += !escaped && character === '{' ? 1 : 0;
    depth -= !escaped && character === '}' ? 1 : 0;
    if (!escaped && character === ',' && depth === 1) {
      commas.push(index);
    }
    if (depth === 0) {
      return { end: index, commas };
    }
  }
  return undefined;
}

function slashGroup(
  pattern: string,
): { readonly start: number; readonly group: BraceGroup | undefined } | undefined {
  return Array.from(pattern, (character, index) => ({ character, index }))
    .filter(({ character, index }) => character === '{' && pattern[index - 1] !== '\\')
    .map(({ index }) => ({ start: index, group: braceAt(pattern, index) }))
    .find(
      ({ start, group }) => group !== undefined && pattern.slice(start, group.end).includes('/'),
    );
}

function alternativesOf(pattern: string): string[] | undefined {
  const found = slashGroup(pattern);
  const group = found?.group;
  if (found === undefined || group === undefined) {
    return undefined;
  }
  const { start } = found;
  const bounds = [start, ...group.commas, group.end];
  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(group.end + 1);
  return bounds
    .slice(1)
    .map((end, index) => `${prefix}${pattern.slice((bounds[index] ?? 0) + 1, end)}${suffix}`);
}

function expandedBraces(pattern: string): string[] {
  const pending = [pattern];
  const expanded: string[] = [];
  for (const current of pending) {
    const alternatives = alternativesOf(current);
    if (alternatives === undefined) {
      expanded.push(current);
    } else {
      appendAll(pending, alternatives);
    }
  }
  return expanded;
}

function rebasedOne(pattern: string, memberSegments: Segments): string | undefined {
  let rest = pattern.split('/');
  for (const segment of memberSegments) {
    const [head = ''] = rest;
    if (head === '**') {
      return rest.join('/');
    }
    if (rest.length < 2 || !globMatcher(head).test(segment)) {
      return undefined;
    }
    rest = rest.slice(1);
  }
  return rest.join('/');
}

function rebasedPatterns(pattern: string, memberSegments: Segments): string[] {
  const rebased = expandedBraces(pattern)
    .map((alternative) => rebasedOne(alternative, memberSegments))
    .filter((value) => value !== undefined);
  return [...new Set(rebased)];
}

function rebasedList(values: readonly string[], memberSegments: Segments): string[] {
  return [...new Set(values.flatMap((value) => rebasedPatterns(value, memberSegments)))];
}

function rebasedKey(value: unknown, memberSegments: Segments, keepEmpty: boolean): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  const rebased = rebasedList(textsOf(value), memberSegments);
  return rebased.length === 0 && !(keepEmpty && value.length === 0) ? undefined : rebased;
}

function rebasedObject(
  object: object,
  rebase: (key: string, value: unknown) => unknown,
): Record<string, unknown> | undefined {
  const entries = Object.entries(object)
    .map(([key, value]): [string, unknown] => [key, rebase(key, value)])
    .filter(([, value]) => value !== undefined);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function rebasedEntries(entries: unknown, memberSegments: Segments): unknown {
  if (!Array.isArray(entries)) {
    return entries;
  }
  const kept = entries.flatMap((entry: unknown): unknown[] => {
    const entryPaths = fieldOf(entry, 'paths');
    if (!Array.isArray(entryPaths)) {
      return [entry];
    }
    const paths = rebasedList(textsOf(entryPaths), memberSegments);
    return paths.length === 0 ? [] : [{ ...fieldsOf(entry), paths }];
  });
  return kept.length === 0 ? undefined : kept;
}

function rebasedPath(value: unknown, memberSegments: Segments): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const [first] = rebasedPatterns(value, memberSegments);
  return first;
}

function rebasedLayout(layout: object, memberSegments: Segments): unknown {
  return rebasedObject(layout, (key, value) => {
    if (LAYOUT_GLOB_KEYS.has(key)) {
      return rebasedKey(value, memberSegments, true);
    }
    return FOLDER_KEYS.has(key) ? rebasedKey(value, memberSegments, false) : value;
  });
}

function rebasedSection(section: object, memberSegments: Segments): unknown {
  return rebasedObject(section, (key, value) => {
    if (key === 'exceptions') {
      return rebasedEntries(value, memberSegments);
    }
    if (FOLDER_KEYS.has(key) || PYTHON_GLOB_KEYS.has(key)) {
      return rebasedKey(value, memberSegments, false);
    }
    return key === 'detektConfig' ? rebasedPath(value, memberSegments) : value;
  });
}

const REBASE: Readonly<Record<string, Rebaser>> = {
  exclude: (value, segments) => rebasedKey(value, segments, false),
  exceptions: rebasedEntries,
  legacyInventory: rebasedPath,
  layout: (value, segments) => (isPlainObject(value) ? rebasedLayout(value, segments) : value),
  testConsole: (value, segments) =>
    isPlainObject(value)
      ? rebasedObject(value, (key, inner) =>
          key === 'allow' ? rebasedEntries(inner, segments) : inner,
        )
      : value,
  python: (value, segments) => (isPlainObject(value) ? rebasedSection(value, segments) : value),
  kotlin: (value, segments) => (isPlainObject(value) ? rebasedSection(value, segments) : value),
};

export function rebasedSettings(
  config: object,
  memberSegments: Segments,
): Record<string, unknown> | undefined {
  return rebasedObject(config, (key, value) => {
    const rebase = REBASE[key];
    return rebase === undefined ? value : rebase(value, memberSegments);
  });
}
