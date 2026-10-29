import {
  closeOf,
  matchingOpen,
  nextSignificant,
  repeatUntil,
  trimmedEnd,
  wordBefore,
} from '../discovery/text-scan.mjs';
import { HOLDER, hasFractionalEquality } from './fractional-literal.mjs';

const TRUTH_CALL = new RegExp(
  String.raw`(?<![\w.\x60])(?:${HOLDER})?(assertTrue|assertFalse)\s*(?:<[^<>()]*>\s*)?(?=[({])`,
  'gu',
);
const KOTEST_TRUTH =
  /\)\s*(?:(?:shouldBe|shouldNotBe)[ \t]+(?:true|false)\b|\.\s*(?:shouldBeTrue|shouldBeFalse)\b)/gu;
const ASSERTJ_TRUTH = /\.\s*(isTrue|isFalse)\s*\(/gu;
const MAX_CHAIN = 16;

function callText(scanned, open) {
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

function assertCalls(scanned) {
  return [...scanned.code.matchAll(TRUTH_CALL)]
    .filter((match) => hasFractionalEquality(callText(scanned, match.index + match[0].length)))
    .map((match) => ({ name: match[1], offset: match.index + match[0].indexOf(match[1]) }));
}

function kotestCalls(scanned) {
  return [...scanned.code.matchAll(KOTEST_TRUTH)]
    .filter((match) => {
      const open = matchingOpen(scanned, match.index);
      return open >= 0 && hasFractionalEquality(scanned.code.slice(open + 1, match.index));
    })
    .map((match) => ({ name: 'shouldBe', offset: match.index }));
}

function receiverArguments(scanned, dot) {
  const found = [];
  let end = trimmedEnd(scanned, dot);
  repeatUntil(MAX_CHAIN, () => {
    const open = scanned.code[end - 1] === ')' ? matchingOpen(scanned, end - 1) : -1;
    if (open < 0) {
      return true;
    }
    found.push(scanned.code.slice(open + 1, end - 1));
    end = trimmedEnd(scanned, wordBefore(scanned, open).start);
    if (scanned.code[end - 1] !== '.') {
      return true;
    }
    end = trimmedEnd(scanned, end - 1);
    return false;
  });
  return found;
}

function assertjCalls(scanned) {
  return [...scanned.code.matchAll(ASSERTJ_TRUTH)]
    .filter((match) => receiverArguments(scanned, match.index).some(hasFractionalEquality))
    .map((match) => ({ name: match[1], offset: match.index }));
}

export function truthHits(scanned, assertj) {
  return [
    ...assertCalls(scanned),
    ...kotestCalls(scanned),
    ...(assertj ? assertjCalls(scanned) : []),
  ];
}
