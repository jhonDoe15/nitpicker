import { globMatcher } from '../paths/glob.mjs';

export const SAMPLE_LIMIT = 400;

export function detectConventions({ definitions, source, pinned = {}, exclude = [] }) {
  const measured = definitions.filter((definition) => pinned[definition.id] === undefined);
  const excluded = exclude.map(globMatcher);
  const candidates =
    measured.length === 0
      ? []
      : source.paths().filter((file) => !excluded.some((glob) => glob.test(file)));
  const samples = new Map(
    measured.map((definition) => [definition.id, sampleFor(definition, candidates)]),
  );
  const texts =
    measured.length === 0 ? new Map() : source.readMany([...new Set([...samples.values()].flat())]);
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

function sampleFor(definition, candidates) {
  const files = definition.files.map(globMatcher);
  return evenSample(
    candidates.filter((file) => files.some((glob) => glob.test(file))),
    SAMPLE_LIMIT,
  );
}

function measureConvention(definition, sample, texts) {
  const counts = Object.fromEntries(definition.options.map((option) => [option, 0]));
  for (const file of sample) {
    const text = texts.get(file);
    const option = text === undefined ? undefined : definition.measure(text);
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
