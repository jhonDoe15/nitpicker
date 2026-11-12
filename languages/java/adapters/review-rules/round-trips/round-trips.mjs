import { readFileSync } from 'node:fs';
import {
  ROUND_TRIP_DIRECTIONS,
  isTestedPair,
  memberCall,
  roundTripMessage,
  shownMember,
} from '../../../../../shared/rules/round-trips/round-trips.mjs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { mainPairs } from './main-pairs.mjs';
import { javaTestNames, kotlinTestNames } from './test-names.mjs';

export const ROUND_TRIP_RULE = 'UntestedRoundTrip';
export const ROUND_TRIP_EXCEPTION_RULE = `pmd/${ROUND_TRIP_RULE}`;
const OPEN_ENDED = new Set(['to', 'from']);

function spellings(verb) {
  return [verb, `${verb[0].toUpperCase()}${verb.slice(1)}`];
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

function sourcesOf(projectRoot, options) {
  return [...projectSourceFiles(projectRoot, options).keys()].map((file) => ({
    file,
    kotlin: file.endsWith('.kt'),
    text: readFileSync(pathInside(projectRoot, file), 'utf8'),
  }));
}

function example({ owner, inner, outer }) {
  return `assertEquals(value, ${memberCall(owner, outer, memberCall(owner, inner, 'value'))})`;
}

export function roundTripFindings(mainSources, readTests) {
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

export function readRoundTripFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const options = { projects, kotlin, exclude: policy.exclude ?? [] };
  return roundTripFindings(sourcesOf(projectRoot, options), () =>
    sourcesOf(projectRoot, { ...options, test: true }),
  );
}
