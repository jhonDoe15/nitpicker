import { splitArguments } from '../../../../scan/kotlin-brackets.mjs';
import { importsOf } from '../../discovery/imports.mjs';
import { mocksAny } from '../faked.mjs';
import { uuidInAssertion } from './uuid-in-assertion.mjs';

const DRAW_TYPES = [
  'Random',
  'ThreadLocalRandom',
  'SplittableRandom',
  'Math',
  'Collections',
  'CollectionsKt',
];
const HEAD = String.raw`(?<![\w.\x60])(?:[a-z]\w*\s*\.\s*)*`;
const SEEDLESS = new RegExp(String.raw`${HEAD}(Random|SplittableRandom)\s*\(\s*\)`, 'gu');
const FIXED_FORMS = [
  [String.raw`Math\s*\.\s*random\s*\(`, 'Math.random'],
  [String.raw`ThreadLocalRandom\s*\.\s*current\s*\(`, 'ThreadLocalRandom.current'],
  [String.raw`Random\s*\.\s*Default\b`, 'Random.Default'],
  [String.raw`Random\s*\.\s*next[A-Z]\w*\s*\(`, 'Random.next'],
].map(([source, family]) => ({ pattern: new RegExp(`${HEAD}${source}`, 'gu'), family }));
const CLOCK_SEED = new RegExp(
  String.raw`${HEAD}(Random|SplittableRandom)\s*\(\s*System\s*\.\s*(?:nanoTime|currentTimeMillis)\s*\(\s*\)\s*\)`,
  'gu',
);
const SHUFFLE = new RegExp(String.raw`${HEAD}Collections\s*\.\s*shuffle\s*\(`, 'gu');
const UNSEEDED_EXTENSION = /(?<!\bMath\s*)\.\s*(random|randomOrNull|shuffled|shuffle)\s*\(\s*\)/gu;
const UUID_DRAW = new RegExp(String.raw`${HEAD}UUID\s*\.\s*randomUUID\s*\(\s*\)`, 'gu');

function hit(match, family, length = match[0].length) {
  return { offset: match.index, end: match.index + length, family };
}

function drawsSeedless(scanned) {
  const imports = importsOf(scanned);
  return [...scanned.code.matchAll(SEEDLESS)].flatMap((match) => {
    const qualified = /^\s*java\s*\./u.test(match[0]);
    const explicit = imports.explicit.get(match[1]);
    const imported =
      explicit === undefined
        ? imports.stars.has('java.util')
        : explicit === `java.util.${match[1]}`;
    return qualified || imported ? [hit(match, `${match[1]}()`)] : [];
  });
}

function drawsClockSeeded(scanned) {
  return [...scanned.code.matchAll(CLOCK_SEED)].map((match) => hit(match, `${match[1]}(clock)`));
}

function drawsFixedForms(scanned) {
  return FIXED_FORMS.flatMap(({ pattern, family }) =>
    [...scanned.code.matchAll(pattern)].map((match) => hit(match, family)),
  );
}

function drawsShuffle(scanned) {
  return [...scanned.code.matchAll(SHUFFLE)].flatMap((match) => {
    const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
    return parts.length === 1 ? [hit(match, 'Collections.shuffle')] : [];
  });
}

function drawsExtensions(scanned) {
  return [...scanned.code.matchAll(UNSEEDED_EXTENSION)].map((match) => hit(match, match[1]));
}

function drawsFaked(scanned) {
  return mocksAny(scanned, DRAW_TYPES);
}

export function randomDraws(scanned) {
  const draws = drawsFaked(scanned)
    ? []
    : [
        ...drawsSeedless(scanned),
        ...drawsClockSeeded(scanned),
        ...drawsFixedForms(scanned),
        ...drawsShuffle(scanned),
        ...drawsExtensions(scanned),
      ];
  const uuids = mocksAny(scanned, ['UUID'])
    ? []
    : [...scanned.code.matchAll(UUID_DRAW)]
        .map((match) => hit(match, 'UUID.randomUUID'))
        .filter((uuid) => uuidInAssertion(scanned, uuid));
  return [...draws, ...uuids].toSorted((left, right) => left.offset - right.offset);
}
