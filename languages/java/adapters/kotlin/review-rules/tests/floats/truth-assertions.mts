import type { TestScanned } from '../typed/discovery-types.mts';
import { groupOf } from '../typed/indexing.mts';
import type { FloatHit } from '../typed/rule-types.mts';
import { closeOf, matchingOpen, nextSignificant } from '../discovery/text-scan.mts';
import { receiverCalls } from './call-chain.mts';
import { HOLDER, hasFractionalEquality } from './fractional-literal.mts';

const TRUTH_CALL = new RegExp(
  String.raw`(?<![\w.\x60])(?:${HOLDER})?(assertTrue|assertFalse)\s*(?:<[^<>()]*>\s*)?(?=[({])`,
  'gu',
);
const KOTEST_TRUTH =
  /\)\s*(?:(?:shouldBe|shouldNotBe)[ \t]+(?:true|false)\b|\.\s*(?:shouldBeTrue|shouldBeFalse)\b)/gu;
const ASSERTJ_TRUTH = /\.\s*(isTrue|isFalse)\s*\(/gu;

function callText(scanned: TestScanned, open: number): string {
  const { code } = scanned;
  const close = closeOf(scanned, open);
  const text = code.slice(open + 1, close);
  const next = nextSignificant(code, close + 1);
  if (code[open] === '(' && next === '{') {
    const block = code.indexOf('{', close + 1);
    return `${text}\n${code.slice(block + 1, closeOf(scanned, block))}`;
  }
  return text;
}

function assertCalls(scanned: TestScanned): FloatHit[] {
  return [...scanned.code.matchAll(TRUTH_CALL)]
    .filter((match) => hasFractionalEquality(callText(scanned, match.index + match[0].length)))
    .map((match) => ({
      name: groupOf(match, 1),
      offset: match.index + match[0].indexOf(groupOf(match, 1)),
    }));
}

function kotestCalls(scanned: TestScanned): FloatHit[] {
  return [...scanned.code.matchAll(KOTEST_TRUTH)]
    .filter((match) => {
      const open = matchingOpen(scanned, match.index);
      return open >= 0 && hasFractionalEquality(scanned.code.slice(open + 1, match.index));
    })
    .map((match) => ({ name: 'shouldBe', offset: match.index }));
}

function assertjCalls(scanned: TestScanned): FloatHit[] {
  return [...scanned.code.matchAll(ASSERTJ_TRUTH)]
    .filter((match) =>
      receiverCalls(scanned, match.index).some(({ inner }) => hasFractionalEquality(inner)),
    )
    .map((match) => ({ name: groupOf(match, 1), offset: match.index }));
}

export function truthHits(scanned: TestScanned, { assertj }: { assertj: boolean }): FloatHit[] {
  return [
    ...assertCalls(scanned),
    ...kotestCalls(scanned),
    ...(assertj ? assertjCalls(scanned) : []),
  ];
}
