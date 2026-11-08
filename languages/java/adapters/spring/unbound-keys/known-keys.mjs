import { editDistance } from '../../../../../shared/messages/closest-match.mjs';
import { relaxKey } from '../spring-config-parser.mjs';

const OPEN_TYPE = /^(?:java\.util\.Properties|java\.lang\.Object)$|[<[]/u;
const DYNAMIC_KEYS = [
  'management.endpoint.*.enabled',
  'management.endpoint.*.access',
  'management.endpoint.*.cache.time-to-live',
  'management.health.*.enabled',
  'management.info.*.enabled',
  'management.*.metrics.export.enabled',
].map((key) => relaxKey(key).split('.'));
const MIN_TYPO_SEGMENT = 5;
const LONG_SEGMENT = 10;
const CLOSEST_SHARE = 3;
const CLOSEST_MINIMUM = 3;

function parentsOf(key) {
  const segments = key.split('.');
  return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join('.'));
}

function opensSuffixes(type) {
  return typeof type !== 'string' || type === '' || OPEN_TYPE.test(type);
}

function addMetadata(index, { properties, groups }) {
  for (const group of groups) {
    index.owned.add(relaxKey(group));
  }
  for (const { name, type, removed, replacement } of properties) {
    const key = relaxKey(name);
    if (removed) {
      index.removed.set(key, replacement);
    } else {
      index.display.set(key, name);
      index.exact.add(key);
      if (opensSuffixes(type)) {
        index.open.add(key);
      }
    }
  }
}

export function knownKeys({ metadata, classes, references }) {
  const index = {
    exact: new Set(),
    open: new Set(),
    owned: new Set(),
    removed: new Map(),
    display: new Map(),
  };
  addMetadata(index, metadata);
  for (const name of [...classes.exact, ...references.exact]) {
    const key = relaxKey(name);
    index.exact.add(key);
    index.display.set(key, index.display.get(key) ?? name);
  }
  for (const name of [...classes.open, ...references.open]) {
    index.open.add(relaxKey(name));
  }
  for (const name of classes.owned) {
    index.owned.add(relaxKey(name));
  }
  index.nodes = new Set(
    [...index.exact, ...index.owned].flatMap((key) => [key, ...parentsOf(key)]),
  );
  for (const retired of [...index.removed.keys()].flatMap(parentsOf)) {
    if (retired.includes('.') && !index.nodes.has(retired)) {
      index.owned.add(retired);
    }
  }
  return index;
}

function matchesDynamic(key) {
  const segments = key.split('.');
  return DYNAMIC_KEYS.some(
    (pattern) =>
      pattern.length === segments.length &&
      pattern.every((part, at) => part === '*' || part === segments[at]),
  );
}

export function isBound(index, key) {
  return (
    index.nodes.has(key) ||
    [key, ...parentsOf(key)].some((prefix) => index.open.has(prefix)) ||
    matchesDynamic(key)
  );
}

function ownedPrefix(index, key) {
  const deepest = parentsOf(key)
    .filter((prefix) => index.nodes.has(prefix) || index.owned.has(prefix))
    .at(-1);
  return index.owned.has(deepest) ? deepest : undefined;
}

function withoutDigits(text) {
  return text.replaceAll(/\d/gu, '');
}

function isTypo(written, known) {
  return (
    written.length >= MIN_TYPO_SEGMENT &&
    withoutDigits(written) !== withoutDigits(known) &&
    written !== `${known}s` &&
    known !== `${written}s` &&
    editDistance(written, known) <= (written.length >= LONG_SEGMENT ? 2 : 1)
  );
}

function childrenOf(index, parent) {
  const depth = parent === '' ? 1 : parent.split('.').length + 1;
  return [...index.nodes].filter(
    (node) => node.split('.').length === depth && (parent === '' || node.startsWith(`${parent}.`)),
  );
}

function corrected(index, key) {
  const segments = key.split('.');
  const depth = segments.findIndex(
    (_, at) => !index.nodes.has(segments.slice(0, at + 1).join('.')),
  );
  const parent = segments.slice(0, depth).join('.');
  const near = childrenOf(index, parent).find((node) =>
    isTypo(segments[depth], node.split('.').at(-1)),
  );
  return near === undefined ? undefined : [near, ...segments.slice(depth + 1)].join('.');
}

function displayed(index, key) {
  return index.display.get(key) ?? key;
}

function sharesStart(written, known) {
  return written.length >= 3 && (known.startsWith(written) || written.startsWith(known));
}

function parentOf(key) {
  return key.split('.').slice(0, -1).join('.');
}

function lastSegment(key) {
  return key.split('.').at(-1);
}

function ranked(key, candidate) {
  const last = lastSegment(key);
  const known = lastSegment(candidate);
  return {
    sibling: parentOf(candidate) === parentOf(key) ? 0 : 1,
    segment: sharesStart(last, known) ? 1 : editDistance(last, known),
    distance: editDistance(key, candidate),
  };
}

function closest(index, key, prefix) {
  const candidates = [
    ...[...index.exact].map((candidate) => ({ candidate, shown: displayed(index, candidate) })),
    ...[...index.removed].map(([candidate, replacement]) => ({ candidate, shown: replacement })),
  ].filter(({ candidate, shown }) => shown !== undefined && candidate.startsWith(`${prefix}.`));
  const limit = Math.max(CLOSEST_MINIMUM, Math.floor(key.length / CLOSEST_SHARE));
  const segmentLimit = Math.max(2, Math.floor(lastSegment(key).length / CLOSEST_SHARE));
  return candidates
    .map((entry) => ({ ...entry, ...ranked(key, entry.candidate) }))
    .filter((entry) => entry.segment <= segmentLimit || entry.distance <= limit)
    .sort(
      (left, right) =>
        left.sibling - right.sibling ||
        left.segment - right.segment ||
        left.distance - right.distance ||
        left.candidate.localeCompare(right.candidate),
    )
    .at(0)?.shown;
}

function suggestion(index, key) {
  if (isBound(index, key)) {
    return displayed(index, key);
  }
  const prefix = ownedPrefix(index, key);
  return prefix === undefined ? undefined : closest(index, key, prefix);
}

export function unboundKey(index, key) {
  if (isBound(index, key)) {
    return undefined;
  }
  if (index.removed.has(key)) {
    return { removed: true, replacement: index.removed.get(key) };
  }
  const prefix = ownedPrefix(index, key);
  if (prefix !== undefined) {
    return { prefix, replacement: closest(index, key, prefix) };
  }
  const typo = corrected(index, key);
  return typo === undefined
    ? undefined
    : { prefix: typo.split('.').slice(0, -1).join('.'), replacement: suggestion(index, typo) };
}
