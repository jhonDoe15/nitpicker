import { globToRegExp } from '../glob.mjs';

export const SAMPLE_LIMIT = 400;

export function detectConventions({
  definitions,
  source,
  pinned = {},
  exclude = [],
  accepts = () => true,
}) {
  const measured = definitions.filter((definition) => pinned[definition.id] === undefined);
  const excluded = exclude.map(globToRegExp);
  const candidatesOf = (options) =>
    measured.length === 0
      ? []
      : source.paths(options).filter((file) => !excluded.some((glob) => glob.test(file)));
  const readable = candidatesOf({});
  const named = measured.some(({ nameOnly }) => nameOnly) ? candidatesOf({ unreadable: true }) : [];
  const samples = new Map(
    measured.map((definition) => [
      definition.id,
      sampleFor(definition, definition.nameOnly ? named : readable, accepts),
    ]),
  );
  const texts =
    measured.length === 0
      ? new Map()
      : source.readMany([
          ...new Set(
            measured.filter(({ nameOnly }) => !nameOnly).flatMap(({ id }) => samples.get(id)),
          ),
        ]);
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      pinned[definition.id] === undefined
        ? measureConvention(definition, samples.get(definition.id), texts)
        : { choice: pinned[definition.id], source: 'pinned', counts: {} },
    ]),
  );
}

export function conventionChoices(detected, definitions) {
  return Object.fromEntries(
    definitions
      .filter(({ id, fallback }) => detected[id].choice !== fallback)
      .map(({ id }) => [id, detected[id].choice]),
  );
}

function sampleFor(definition, candidates, accepts) {
  const files = definition.files.map(globToRegExp);
  return evenSample(
    candidates.filter((file) => files.some((glob) => glob.test(file)) && accepts(definition, file)),
    SAMPLE_LIMIT,
  );
}

function measureConvention(definition, sample, texts) {
  const counts = Object.fromEntries(definition.options.map((option) => [option, 0]));
  for (const file of sample) {
    const text = texts.get(file);
    const option =
      text === undefined && !definition.nameOnly ? undefined : definition.measure(text, file);
    if (option !== undefined && option in counts) {
      counts[option] += 1;
    }
  }
  const winner = pluralityOf(counts);
  return winner === undefined
    ? { choice: definition.fallback, source: 'default', counts, files: sample.length }
    : { choice: winner, source: 'majority', counts, files: sample.length };
}

function pluralityOf(counts) {
  const ranked = Object.entries(counts).sort(([, left], [, right]) => right - left);
  const [first, second] = ranked;
  if (first === undefined || first[1] === 0 || (second !== undefined && second[1] === first[1])) {
    return undefined;
  }
  return first[0];
}

function evenSample(files, limit) {
  const sorted = [...files].sort();
  if (sorted.length <= limit) {
    return sorted;
  }
  const stride = sorted.length / limit;
  return Array.from({ length: limit }, (_, index) => sorted[Math.floor(index * stride)]);
}
