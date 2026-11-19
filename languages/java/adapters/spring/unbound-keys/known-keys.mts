import { editDistance, prefixesOf } from '../typed/shared-views.mts';
import { relaxKey } from '../spring-config-parser.mts';
import type {
  ClasspathMetadata,
  KnownIndex,
  KnownInput,
  RankedCandidate,
  Verdict,
} from '../typed/unbound-types.mts';

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
const MIN_SHARED_START = 3;

function opensSuffixes(type: unknown): boolean {
  return typeof type !== 'string' || type === '' || OPEN_TYPE.test(type);
}

function addMetadata(index: KnownIndex, { properties, groups }: ClasspathMetadata): void {
  for (const group of groups) {
    index.owned.add(relaxKey(group));
  }
  for (const { name, replacement } of properties.filter(({ removed }) => removed)) {
    index.removed.set(relaxKey(name), replacement);
  }
  for (const { name, type } of properties.filter(({ removed }) => !removed)) {
    const key = relaxKey(name);
    index.display.set(key, name);
    index.exact.add(key);
    if (opensSuffixes(type)) {
      index.open.add(key);
    }
  }
}

export function knownKeys({ metadata, classes, references }: KnownInput): KnownIndex {
  const index: KnownIndex = {
    exact: new Set(),
    open: new Set(),
    owned: new Set(),
    claimed: new Set(),
    removed: new Map(),
    display: new Map(),
    nodes: new Set(),
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
    index.claimed.add(relaxKey(name));
  }
  index.nodes = new Set(
    [...index.exact, ...index.owned, ...index.claimed].flatMap((key) => [
      key,
      ...prefixesOf(key, '.'),
    ]),
  );
  for (const retired of [...index.removed.keys()].flatMap((key) => prefixesOf(key, '.'))) {
    if (retired.includes('.') && !index.nodes.has(retired)) {
      index.owned.add(retired);
    }
  }
  return index;
}

function matchesDynamic(key: string): boolean {
  const segments = key.split('.');
  return DYNAMIC_KEYS.some(
    (pattern) =>
      pattern.length === segments.length &&
      pattern.every((part, at) => part === '*' || part === segments[at]),
  );
}

function isBound(index: KnownIndex, key: string): boolean {
  return (
    index.nodes.has(key) ||
    [key, ...prefixesOf(key, '.')].some((prefix) => index.open.has(prefix)) ||
    matchesDynamic(key)
  );
}

function ownedPrefix(index: KnownIndex, key: string): string | undefined {
  const deepest = prefixesOf(key, '.')
    .filter((prefix) => index.nodes.has(prefix) || index.owned.has(prefix))
    .at(-1);
  return deepest !== undefined && index.owned.has(deepest) ? deepest : undefined;
}

function withoutDigits(text: string): string {
  return text.replaceAll(/\d/gu, '');
}

function isTypo(written: string, known: string): boolean {
  return (
    written.length >= MIN_TYPO_SEGMENT &&
    withoutDigits(written) !== withoutDigits(known) &&
    written !== `${known}s` &&
    known !== `${written}s` &&
    editDistance(written, known) <= (written.length >= LONG_SEGMENT ? 2 : 1)
  );
}

function childrenOf(index: KnownIndex, parent: string): string[] {
  const depth = parent === '' ? 1 : parent.split('.').length + 1;
  return [...index.nodes].filter(
    (node) => node.split('.').length === depth && (parent === '' || node.startsWith(`${parent}.`)),
  );
}

function corrected(index: KnownIndex, key: string): string | undefined {
  const segments = key.split('.');
  const depth = segments.findIndex(
    (_, at) => !index.nodes.has(segments.slice(0, at + 1).join('.')),
  );
  const parent = segments.slice(0, depth).join('.');
  const near = childrenOf(index, parent).find((node) =>
    isTypo(segments[depth] ?? '', node.split('.').at(-1) ?? ''),
  );
  return near === undefined ? undefined : [near, ...segments.slice(depth + 1)].join('.');
}

function displayed(index: KnownIndex, key: string): string {
  return index.display.get(key) ?? key;
}

function sharesStart(written: string, known: string): boolean {
  return (
    written.length >= MIN_SHARED_START && (known.startsWith(written) || written.startsWith(known))
  );
}

function parentOf(key: string): string {
  return key.split('.').slice(0, -1).join('.');
}

function lastSegment(key: string): string {
  return key.split('.').at(-1) ?? '';
}

function ranked(key: string, candidate: string): RankedCandidate {
  const last = lastSegment(key);
  const known = lastSegment(candidate);
  return {
    sibling: parentOf(candidate) === parentOf(key) ? 0 : 1,
    segment: sharesStart(last, known) ? 1 : editDistance(last, known),
    distance: editDistance(key, candidate),
  };
}

function closest(index: KnownIndex, key: string, prefix: string): string | undefined {
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

function suggestion(index: KnownIndex, key: string): string | undefined {
  if (isBound(index, key)) {
    return displayed(index, key);
  }
  const prefix = ownedPrefix(index, key);
  return prefix === undefined ? undefined : closest(index, key, prefix);
}

export function unboundKey(index: KnownIndex, key: string): Verdict | undefined {
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
