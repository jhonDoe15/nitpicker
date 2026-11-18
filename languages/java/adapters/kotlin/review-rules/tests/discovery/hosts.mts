import type { Host, HostFrame, TextSource } from '../typed/discovery-types.mts';
import {
  lineEndOf,
  lineStartOf,
  marksFrom,
  matchingOpen,
  repeatUntil,
  trimmedEnd,
  wordBefore,
} from './text-scan.mts';

const DECLARING = new Set(['fun', 'class', 'object']);
const NO_HOST_BEFORE = ['->', '=', '(', ','];
const CHAIN_START = /^\s*(?:\.|\?\.)/u;
const MAX_CHAIN_LINES = 20;

export function statementStart(code: string, index: number): number {
  const state = { start: lineStartOf(code, index) };
  repeatUntil(MAX_CHAIN_LINES, () => {
    const chained = CHAIN_START.test(code.slice(state.start, lineEndOf(code, state.start)));
    if (state.start === 0 || !chained) {
      return true;
    }
    state.start = lineStartOf(code, state.start - 1);
    return false;
  });
  return state.start;
}

function viaDot(text: TextSource, nameStart: number): number {
  const { code } = text;
  const before = trimmedEnd(text, nameStart);
  const dot = code[before - 1] === '.' ? before - 1 : -1;
  return code[dot - 1] === '?' ? dot - 1 : dot;
}

export function hostAt(text: TextSource, open: number): Host {
  const { code } = text;
  const before = trimmedEnd(text, open);
  if (
    NO_HOST_BEFORE.some((mark) => code.slice(Math.max(0, before - mark.length), before) === mark)
  ) {
    return { name: '', args: '', receiver: '' };
  }
  const state = { end: before, args: '' };
  const callOpen = code[before - 1] === ')' ? matchingOpen(text, before - 1) : -1;
  if (callOpen >= 0) {
    state.args = code.slice(callOpen + 1, before - 1);
    state.end = trimmedEnd(text, callOpen);
  }
  const { word, start } = wordBefore(text, state.end);
  const previous = wordBefore(text, start).word;
  const dot = viaDot(text, start);
  const receiver = dot < 0 ? '' : code.slice(statementStart(code, dot), dot);
  return { name: DECLARING.has(previous) ? previous : word, args: state.args, receiver };
}

export function enclosingHosts(text: TextSource, from: number, offset: number): HostFrame[] {
  const stack: number[] = [];
  for (const { index, 0: mark } of marksFrom(text.code, /[{}]/gu, from)) {
    if (index >= offset) {
      break;
    }
    if (mark === '{') {
      stack.push(index);
    } else {
      stack.pop();
    }
  }
  return stack.map((open) => ({ open, ...hostAt(text, open) }));
}
