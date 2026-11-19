import type { ChainStep, StartSite } from '../typed/rule-types.mts';
import type { TestScanned } from '../typed/discovery-types.mts';
import { enclosingHosts } from '../discovery/hosts.mts';
import {
  matchingOpen,
  remembered,
  repeatUntil,
  trimmedEnd,
  wordBefore,
} from '../discovery/text-scan.mts';
import { alwaysNewCalls, declarationsOf, heavyKind } from './start-kinds.mts';

const START = /\??\.\s*start\s*\(/gu;
const IMPLICIT_START = /(?<![\w.`])(?:(?:it|this)\s*\.\s*)?start\s*\(/gu;
const SCOPE_FUNCTIONS = new Set(['apply', 'also', 'let', 'run', 'use']);
const MAX_CHAIN = 20;
const GENERIC_CLOSE = '>';

function skipGenerics(scanned: TestScanned, open: number): number {
  const { code } = scanned;
  const end = trimmedEnd(scanned, open);
  if (code[end - 1] !== GENERIC_CLOSE) {
    return open;
  }
  const state = { depth: 0, index: end - 1, found: open };
  repeatUntil(end, () => {
    state.depth += code[state.index] === '>' ? 1 : 0;
    state.depth -= code[state.index] === '<' ? 1 : 0;
    if (state.depth === 0) {
      state.found = state.index;
      return true;
    }
    state.index -= 1;
    return state.index < 0;
  });
  return state.found;
}

function receiverWord(scanned: TestScanned, end: number): { word: string; start: number } {
  const bang = scanned.code.slice(end - 2, end) === '!!' ? 2 : 0;
  return wordBefore(scanned, end - bang);
}

function callStep(scanned: TestScanned, end: number): ChainStep {
  const open = matchingOpen(scanned, end - 1);
  if (open < 0) {
    return { done: true };
  }
  const { word, start } = wordBefore(scanned, skipGenerics(scanned, open));
  const before = trimmedEnd(scanned, start);
  if (scanned.code[before - 1] === '.') {
    return { done: false, next: before - (scanned.code[before - 2] === '?' ? 2 : 1) };
  }
  const heavy = word !== '' && heavyKind(scanned, word) !== undefined;
  return { done: true, site: heavy ? { offset: start, name: word } : undefined };
}

function variableSite(scanned: TestScanned, end: number): StartSite | undefined {
  const { word, start } = receiverWord(scanned, end);
  const before = trimmedEnd(scanned, start);
  const viaThis =
    scanned.code[before - 1] === '.' && wordBefore(scanned, before - 1).word === 'this';
  if (word === '' || word === 'it' || (scanned.code[before - 1] === '.' && !viaThis)) {
    return undefined;
  }
  const known = declarationsOf(scanned).some(({ name }) => name === word);
  return known ? { offset: start, name: word, receiver: word } : undefined;
}

function chainStep(scanned: TestScanned, dot: number): ChainStep {
  const end = trimmedEnd(scanned, dot);
  if (end <= 0) {
    return { done: true };
  }
  if (scanned.code[end - 1] === ')') {
    return callStep(scanned, end);
  }
  return { done: true, site: variableSite(scanned, end) };
}

function siteAt(scanned: TestScanned, dot: number): StartSite | undefined {
  const steps = [chainStep(scanned, dot)];
  repeatUntil(MAX_CHAIN, () => {
    const last = steps.at(-1);
    if (last === undefined || last.done) {
      return true;
    }
    steps.push(chainStep(scanned, last.next));
    return false;
  });
  const final = steps.at(-1);
  return final?.done === true ? final.site : undefined;
}

function scopedSite(scanned: TestScanned, offset: number): StartSite | undefined {
  const host = enclosingHosts(scanned, 0, offset).at(-1);
  if (host === undefined || !SCOPE_FUNCTIONS.has(host.name)) {
    return undefined;
  }
  const { start } = wordBefore(scanned, trimmedEnd(scanned, host.open));
  const dot = trimmedEnd(scanned, start) - 1;
  if (scanned.code[dot] !== '.') {
    return undefined;
  }
  return siteAt(scanned, scanned.code[dot - 1] === '?' ? dot - 1 : dot);
}

function implicitStarts(scanned: TestScanned): StartSite[] {
  return [...scanned.code.matchAll(IMPLICIT_START)].flatMap((match) => {
    if (wordBefore(scanned, match.index).word === 'fun') {
      return [];
    }
    const site = scopedSite(scanned, match.index);
    return site === undefined ? [] : [site];
  });
}

export function startSites(scanned: TestScanned): StartSite[] {
  return remembered(scanned, 'start-sites', () => {
    const starts = [...scanned.code.matchAll(START)].flatMap((match) => {
      const site = siteAt(scanned, match.index);
      return site === undefined ? [] : [site];
    });
    const unique = new Map(
      [...starts, ...implicitStarts(scanned), ...alwaysNewCalls(scanned)].map((site) => [
        site.offset,
        site,
      ]),
    );
    return [...unique.values()].toSorted((left, right) => left.offset - right.offset);
  });
}
