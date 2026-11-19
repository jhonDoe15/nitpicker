import { readFileSync } from 'node:fs';
import {
  ROUND_TRIP_DIRECTIONS,
  isTestedPair as untypedIsTestedPair,
  memberCall as untypedMemberCall,
  roundTripMessage as untypedRoundTripMessage,
  shownMember as untypedShownMember,
} from '../../../../../shared/rules/round-trips/round-trips.mjs';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type {
  TripFunction,
  TripOptions,
  TripPair,
  TripProject,
  TripSource,
} from './trip-types.mts';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { pathInside, projectSourceFiles } from '../java-sources.mts';
import { mainPairs } from './main-pairs.mts';
import { javaTestNames, kotlinTestNames } from './test-names.mts';

const isTestedPair: (tests: readonly Set<string>[], pair: TripPair) => boolean =
  untypedIsTestedPair;
const memberCall: (owner: string | undefined, member: TripFunction, argument: string) => string =
  untypedMemberCall;
const roundTripMessage: (parts: { first: string; second: string; example: string }) => string =
  untypedRoundTripMessage;
const shownMember: (owner: string | undefined, member: TripFunction) => string = untypedShownMember;

export const ROUND_TRIP_RULE = 'UntestedRoundTrip';
export const ROUND_TRIP_EXCEPTION_RULE = `pmd/${ROUND_TRIP_RULE}`;
const OPEN_ENDED = new Set(['to', 'from']);

function spellings(verb: string): string[] {
  return [verb, `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`];
}

const PAIR_WORD = new RegExp(
  ROUND_TRIP_DIRECTIONS.flat()
    .flatMap(spellings)
    .map((verb) =>
      OPEN_ENDED.has(verb.toLowerCase()) ? `\\b${verb}[A-Z_]` : `\\b${verb}(?![a-z0-9])`,
    )
    .join('|'),
  'u',
);

function sourcesOf(projectRoot: string, options: TripOptions): TripSource[] {
  return [...projectSourceFiles(projectRoot, options).keys()].map((file) => ({
    file,
    kotlin: file.endsWith('.kt'),
    text: readFileSync(pathInside(projectRoot, file), 'utf8'),
  }));
}

function example({ owner, inner, outer }: TripPair): string {
  return `assertEquals(value, ${memberCall(owner, outer, memberCall(owner, inner, 'value'))})`;
}

export function roundTripFindings(
  mainSources: readonly TripSource[],
  readTests: () => readonly Pick<TripSource, 'kotlin' | 'text'>[],
): ReviewFinding[] {
  const pairs = mainSources.flatMap((source) =>
    PAIR_WORD.test(source.text)
      ? mainPairs(source.text, { kotlin: source.kotlin }).map((pair) => ({ ...pair, source }))
      : [],
  );
  if (pairs.length === 0) {
    return [];
  }
  const finding = findingFactory();
  const tests = readTests().flatMap(({ text, kotlin }) =>
    kotlin ? kotlinTestNames(text) : javaTestNames(text),
  );
  return pairs
    .filter((pair) => !isTestedPair(tests, pair))
    .map((pair) =>
      finding({
        rule: ROUND_TRIP_RULE,
        file: pair.source.file,
        line: pair.later.line,
        symbol: shownMember(pair.owner, pair.later),
        key: `${shownMember(pair.owner, pair.earlier)}:${pair.later.name}`,
        message: roundTripMessage({
          first: shownMember(pair.owner, pair.earlier),
          second: shownMember(pair.owner, pair.later),
          example: example(pair),
        }),
      }),
    );
}

export function readRoundTripFindings(
  projectRoot: string,
  {
    projects,
    kotlin,
    policy = {},
  }: {
    projects: readonly TripProject[];
    kotlin: boolean;
    policy?: { readonly exclude?: readonly string[] };
  },
): ReviewFinding[] {
  const options: TripOptions = { projects, kotlin, exclude: policy.exclude ?? [], test: false };
  return roundTripFindings(sourcesOf(projectRoot, options), () =>
    sourcesOf(projectRoot, { ...options, test: true }),
  );
}
