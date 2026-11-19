import type { TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import type { ClockHit } from '../../typed/rule-types.mts';
import { splitArguments } from '../../../../scan/kotlin-brackets.mts';
import { importsOf } from '../../discovery/imports.mts';
import { mocksAny } from '../faked.mts';
import { HEAD, fixedForms } from '../fixed-forms.mts';
import { uuidInAssertion } from './uuid-in-assertion.mts';

const DRAW_TYPES = [
  'Random',
  'ThreadLocalRandom',
  'SplittableRandom',
  'Math',
  'Collections',
  'CollectionsKt',
];
const SEEDLESS = new RegExp(String.raw`${HEAD}(Random|SplittableRandom)\s*\(\s*\)`, 'gu');
const FIXED_FORMS = fixedForms([
  [/Math\s*\.\s*random\s*\(/u, 'Math.random'],
  [/ThreadLocalRandom\s*\.\s*current\s*\(/u, 'ThreadLocalRandom.current'],
  [/Random\s*\.\s*Default\b/u, 'Random.Default'],
  [/Random\s*\.\s*next[A-Z]\w*\s*\(/u, 'Random.next'],
]);
const CLOCK_SEED = new RegExp(
  String.raw`${HEAD}(Random|SplittableRandom)\s*\(\s*System\s*\.\s*(?:nanoTime|currentTimeMillis)\s*\(\s*\)\s*\)`,
  'gu',
);
const SHUFFLE = new RegExp(String.raw`${HEAD}Collections\s*\.\s*shuffle\s*\(`, 'gu');
const UNSEEDED_EXTENSION = /(?<!\bMath\s*)\.\s*(random|randomOrNull|shuffled|shuffle)\s*\(\s*\)/gu;
const UUID_DRAW = new RegExp(String.raw`${HEAD}UUID\s*\.\s*randomUUID\s*\(\s*\)`, 'gu');

function hit(match: RegExpExecArray, family: string, length = match[0].length): ClockHit {
  return { offset: match.index, end: match.index + length, family };
}

function drawsSeedless(scanned: TestScanned): ClockHit[] {
  const imports = importsOf(scanned);
  return [...scanned.code.matchAll(SEEDLESS)].flatMap((match) => {
    const qualified = /^\s*java\s*\./u.test(match[0]);
    const explicit = imports.explicit.get(groupOf(match, 1));
    const imported =
      explicit === undefined
        ? imports.stars.has('java.util')
        : explicit === `java.util.${groupOf(match, 1)}`;
    return qualified || imported ? [hit(match, `${groupOf(match, 1)}()`)] : [];
  });
}

function drawsClockSeeded(scanned: TestScanned): ClockHit[] {
  return [...scanned.code.matchAll(CLOCK_SEED)].map((match) =>
    hit(match, `${groupOf(match, 1)}(clock)`),
  );
}

function drawsFixedForms(scanned: TestScanned): ClockHit[] {
  return FIXED_FORMS.flatMap(({ pattern, family }) =>
    [...scanned.code.matchAll(pattern)].map((match) => hit(match, family)),
  );
}

function drawsShuffle(scanned: TestScanned): ClockHit[] {
  return [...scanned.code.matchAll(SHUFFLE)].flatMap((match) => {
    const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
    return parts.length === 1 ? [hit(match, 'Collections.shuffle')] : [];
  });
}

function drawsExtensions(scanned: TestScanned): ClockHit[] {
  return [...scanned.code.matchAll(UNSEEDED_EXTENSION)].map((match) =>
    hit(match, groupOf(match, 1)),
  );
}

function drawsFaked(scanned: TestScanned): boolean {
  return mocksAny(scanned, DRAW_TYPES);
}

export function randomDraws(scanned: TestScanned): ClockHit[] {
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
