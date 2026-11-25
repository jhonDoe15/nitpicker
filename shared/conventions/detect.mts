import { globMatcher } from '../paths/glob.mts';
import { textsOf } from '../values/readers.mts';
import type { Convention, ConventionSource, Counts, DetectedEntry } from './convention-types.mts';

export const SAMPLE_LIMIT = 400;

type Texts = ReadonlyMap<string, string | undefined>;
type Accepts = (definition: Convention, file: string) => boolean;

function isPinned(pinned: Readonly<Record<string, unknown>>, id: string): boolean {
  return Object.hasOwn(pinned, id) && pinned[id] !== undefined;
}

export function detectConventions({
  definitions,
  source,
  pinned = {},
  exclude = [],
  accepts = () => true,
}: {
  readonly definitions: readonly Convention[];
  readonly source: ConventionSource | undefined;
  readonly pinned?: Readonly<Record<string, unknown>>;
  readonly exclude?: readonly string[];
  readonly accepts?: Accepts | undefined;
}): Record<string, DetectedEntry> {
  const measured = definitions.filter((definition) => !isPinned(pinned, definition.id));
  const excluded = exclude.map((glob) => globMatcher(glob));
  function candidatesOf(options: { readonly unreadable?: true }): string[] {
    if (measured.length === 0) {
      return [];
    }
    if (source === undefined) {
      throw new TypeError('detectConventions needs a source to measure conventions');
    }
    return source.paths(options).filter((file) => !excluded.some((glob) => glob.test(file)));
  }
  const readable = candidatesOf({});
  const named = measured.some(({ nameOnly }) => nameOnly === true)
    ? candidatesOf({ unreadable: true })
    : [];
  const samples = new Map(
    measured.map((definition): [string, string[]] => [
      definition.id,
      sampleFor(definition, definition.nameOnly === true ? named : readable, accepts),
    ]),
  );
  const texts: Texts =
    measured.length === 0 || source === undefined
      ? new Map()
      : source.readMany([
          ...new Set(measured.flatMap((definition) => filesToRead(definition, samples))),
        ]);
  return Object.fromEntries(
    definitions.map((definition): [string, DetectedEntry] => [
      definition.id,
      isPinned(pinned, definition.id)
        ? { choice: pinned[definition.id], source: 'pinned', counts: {} }
        : measureConvention(definition, samples.get(definition.id) ?? [], texts),
    ]),
  );
}

export function conventionChoices(
  detected: Readonly<Record<string, DetectedEntry>>,
  definitions: readonly { readonly id: string; readonly fallback?: unknown }[],
): Record<string, unknown> {
  return Object.fromEntries(
    definitions
      .filter(
        ({ id, fallback }) =>
          detected[id]?.followsConfig === true ||
          JSON.stringify(detected[id]?.choice) !== JSON.stringify(fallback),
      )
      .map(({ id }) => [id, detected[id]?.choice]),
  );
}

function filesToRead(definition: Convention, samples: ReadonlyMap<string, string[]>): string[] {
  const sample = samples.get(definition.id) ?? [];
  if (definition.nameOnly !== true) {
    return sample;
  }
  return definition.needsText === undefined ? [] : sample.filter(definition.needsText);
}

function sampleFor(
  definition: Convention,
  candidates: readonly string[],
  accepts: Accepts,
): string[] {
  const files = definition.files.map((glob) => globMatcher(glob));
  return evenSample(
    candidates.filter((file) => files.some((glob) => glob.test(file)) && accepts(definition, file)),
    definition.sampleLimit ?? SAMPLE_LIMIT,
  );
}

function measureConvention(
  definition: Convention,
  sample: readonly string[],
  texts: Texts,
): DetectedEntry {
  return definition.kind === 'names'
    ? measureNames(definition, sample, texts)
    : measureOptions(definition, sample, texts);
}

function measureOptions(
  definition: Convention,
  sample: readonly string[],
  texts: Texts,
): DetectedEntry {
  const counts: Counts = Object.fromEntries(
    (definition.options ?? []).map((option): [string, number] => [option, 0]),
  );
  for (const file of sample) {
    const text = texts.get(file);
    const option =
      text === undefined && definition.nameOnly !== true
        ? undefined
        : definition.measure?.(text, file);
    if (typeof option === 'string' && option in counts) {
      counts[option] = (counts[option] ?? 0) + 1;
    }
  }
  const winner = pluralityOf(counts, definition);
  return winner === undefined
    ? { choice: definition.fallback, source: 'default', counts, files: sample.length }
    : { choice: winner, source: 'majority', counts, files: sample.length };
}

function measureNames(
  definition: Convention,
  sample: readonly string[],
  texts: Texts,
): DetectedEntry {
  const counts: Counts = {};
  for (const file of sample) {
    const text = texts.get(file);
    const names = text === undefined ? [] : textsOf(definition.measure?.(text, file));
    for (const name of new Set(names)) {
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  const choice = (
    definition.choose?.(counts, definition) ??
    Object.keys(counts).filter(
      (name) => (counts[name] ?? 0) >= (definition.minFiles ?? Number.POSITIVE_INFINITY),
    )
  ).toSorted();
  return choice.length === 0
    ? { choice: definition.fallback, source: 'default', counts, files: sample.length }
    : { choice, source: 'majority', counts, files: sample.length };
}

function pluralityOf(
  counts: Counts,
  {
    minVotes = 0,
    strictMajority,
  }: { readonly minVotes?: number; readonly strictMajority?: unknown },
): string | undefined {
  const ranked = Object.entries(counts).sort(([, left], [, right]) => right - left);
  const [first, second] = ranked;
  const votes = ranked.reduce((total, [, count]) => total + count, 0);
  if (
    first === undefined ||
    first[1] === 0 ||
    (second !== undefined && second[1] === first[1]) ||
    votes < minVotes ||
    (strictMajority === true && first[1] * 2 <= votes)
  ) {
    return undefined;
  }
  return first[0];
}

function evenSample(files: readonly string[], limit: number): string[] {
  const sorted = [...files].sort();
  if (sorted.length <= limit) {
    return sorted;
  }
  const stride = sorted.length / limit;
  return Array.from({ length: limit }, (_, index) => sorted[Math.floor(index * stride)]).filter(
    (file) => file !== undefined,
  );
}

export function followedHelpers(
  counts: Counts,
  { minFiles }: { readonly minFiles?: number },
): string[] {
  return Object.keys(counts)
    .filter((key) => key.startsWith('use:'))
    .map((key) => key.slice('use:'.length))
    .filter((name) => (counts[`use:${name}`] ?? 0) >= (minFiles ?? Number.POSITIVE_INFINITY))
    .filter((name) => (counts[`def:${name}`] ?? 0) > 0);
}
