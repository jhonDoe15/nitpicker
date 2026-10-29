import { isPlainObject } from '../../../../shared/config.mjs';
import { globMatcher } from '../../../../shared/paths/glob.mjs';

const LAYOUT_GLOB_KEYS = new Set(['excludedGlobs', 'entryPoints', 'sharedRoots', 'featureRoots']);
const FOLDER_KEYS = new Set(['sourceRoots', 'testRoots']);
const PYTHON_GLOB_KEYS = new Set(['entryPoints']);

function braceAt(pattern, start) {
  let depth = 0;
  const commas = [];
  for (const [offset, character] of [...pattern.slice(start)].entries()) {
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

function slashGroup(pattern) {
  return [...pattern]
    .map((character, index) => ({ character, index }))
    .filter(({ character, index }) => character === '{' && pattern[index - 1] !== '\\')
    .map(({ index }) => ({ start: index, group: braceAt(pattern, index) }))
    .find(
      ({ start, group }) => group !== undefined && pattern.slice(start, group.end).includes('/'),
    );
}

function alternativesOf(pattern) {
  const found = slashGroup(pattern);
  if (found === undefined) {
    return undefined;
  }
  const { start, group } = found;
  const bounds = [start, ...group.commas, group.end];
  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(group.end + 1);
  return bounds
    .slice(1)
    .map((end, index) => `${prefix}${pattern.slice(bounds[index] + 1, end)}${suffix}`);
}

function expandedBraces(pattern) {
  const pending = [pattern];
  const expanded = [];
  for (const current of pending) {
    const alternatives = alternativesOf(current);
    if (alternatives === undefined) {
      expanded.push(current);
    } else {
      pending.push(...alternatives);
    }
  }
  return expanded;
}

function rebasedOne(pattern, memberSegments) {
  let rest = pattern.split('/');
  for (const segment of memberSegments) {
    if (rest[0] === '**') {
      return rest.join('/');
    }
    if (rest.length < 2 || !globMatcher(rest[0]).test(segment)) {
      return undefined;
    }
    rest = rest.slice(1);
  }
  return rest.join('/');
}

function rebasedPatterns(pattern, memberSegments) {
  const rebased = expandedBraces(pattern)
    .map((alternative) => rebasedOne(alternative, memberSegments))
    .filter((value) => value !== undefined);
  return [...new Set(rebased)];
}

function rebasedList(values, memberSegments) {
  return [...new Set(values.flatMap((value) => rebasedPatterns(value, memberSegments)))];
}

function rebasedKey(value, memberSegments, keepEmpty) {
  if (!Array.isArray(value)) {
    return value;
  }
  const rebased = rebasedList(value, memberSegments);
  return rebased.length === 0 && !(keepEmpty && value.length === 0) ? undefined : rebased;
}

function rebasedObject(object, rebase) {
  const entries = Object.entries(object)
    .map(([key, value]) => [key, rebase(key, value)])
    .filter(([, value]) => value !== undefined);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function rebasedEntries(entries, memberSegments) {
  if (!Array.isArray(entries)) {
    return entries;
  }
  const kept = entries.flatMap((entry) => {
    if (!Array.isArray(entry?.paths)) {
      return [entry];
    }
    const paths = rebasedList(entry.paths, memberSegments);
    return paths.length === 0 ? [] : [{ ...entry, paths }];
  });
  return kept.length === 0 ? undefined : kept;
}

function rebasedPath(value, memberSegments) {
  if (typeof value !== 'string') {
    return value;
  }
  const [first] = rebasedPatterns(value, memberSegments);
  return first;
}

function rebasedLayout(layout, memberSegments) {
  return rebasedObject(layout, (key, value) => {
    if (LAYOUT_GLOB_KEYS.has(key)) {
      return rebasedKey(value, memberSegments, true);
    }
    return FOLDER_KEYS.has(key) ? rebasedKey(value, memberSegments, false) : value;
  });
}

function rebasedSection(section, memberSegments) {
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

const REBASE = {
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

export function rebasedSettings(config, memberSegments) {
  return rebasedObject(config, (key, value) =>
    REBASE[key] === undefined ? value : REBASE[key](value, memberSegments),
  );
}
