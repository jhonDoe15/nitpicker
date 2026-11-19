import type { Span, TestScanned } from '../../typed/discovery-types.mts';
import type { ArgCall, Receiver } from '../../typed/rule-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import { splitArguments } from '../../../../scan/kotlin-source.mts';
import {
  escapeRegExp,
  matchingOpen,
  repeatUntil,
  skipSpace,
  trimmedEnd,
  WORD_WINDOW,
  wordBefore,
} from '../../discovery/text-scan.mts';

const CALL = /(?<![\w`])([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?\(/gu;
const MAX_CHAIN = 50;
const CONTINUES = /[=(,.&|+\-*/%?:<]$/u;
const USED = /[.?!{]/u;
const INFIX_START = /\w/u;
export const ASSERT_ROOT = /^(?:\w+\.)*assertThat\w*\s*[(<]/u;
const SIZE_END = /[\w)\]`!?]\.(?:size|length|count\(\))$/u;

export function squeezed(text: string): string {
  return text.replaceAll(/\s+/gu, '');
}

export function argumentCalls(scanned: TestScanned, { start, end }: Span): ArgCall[] {
  const { code } = scanned;
  return [...code.slice(start, end).matchAll(CALL)]
    .map((match) => {
      const offset = start + match.index;
      const open = offset + match[0].length - 1;
      const { close, parts } = splitArguments(code, open);
      return {
        name: groupOf(match, 1),
        offset,
        open,
        close,
        args: parts.map((part) => code.slice(part.start, part.end).trim()),
      };
    })
    .filter((call) => call.close <= end);
}

export function isSizeExpression(text: string): boolean {
  return SIZE_END.test(squeezed(text));
}

function startsStatement(scanned: TestScanned, offset: number): boolean {
  const { code } = scanned;
  const before = trimmedEnd(scanned, offset);
  if (
    before === 0 ||
    '{;}'.includes(code[before - 1] ?? ' ') ||
    code.startsWith('->', before - 2)
  ) {
    return true;
  }
  return code.slice(before, offset).includes('\n') && !CONTINUES.test(code[before - 1] ?? ' ');
}

export function resultUnused(scanned: TestScanned, from: number, close: number): boolean {
  const { code } = scanned;
  const nextAt = skipSpace(code, close + 1);
  const next = code[nextAt] ?? '';
  const sameLine = !code.slice(close + 1, nextAt).includes('\n');
  const used = USED.test(next) || (sameLine && INFIX_START.test(next));
  return startsStatement(scanned, from) && !used;
}

function wordStart(scanned: TestScanned, at: number): number {
  const quoted = scanned.code[at - 1] === '`' ? scanned.code.lastIndexOf('`', at - 2) : -1;
  const { word, start } = wordBefore(scanned, at);
  if (quoted >= 0) {
    return quoted;
  }
  return word === '' ? at : start;
}

function groupStart(scanned: TestScanned, end: number): number {
  const open = matchingOpen(scanned, end - 1);
  return open < 0 ? end : wordStart(scanned, open);
}

function unitStart(scanned: TestScanned, end: number): number {
  const { code } = scanned;
  const bangs = /(?:!!)*$/u.exec(code.slice(Math.max(0, end - WORD_WINDOW), end))?.[0].length ?? 0;
  const at = end - bangs;
  return ')]'.includes(code[at - 1] ?? ' ') ? groupStart(scanned, at) : wordStart(scanned, at);
}

export function receiverStart(scanned: TestScanned, end: number): number {
  const { code } = scanned;
  const at = trimmedEnd(scanned, end);
  const state = { at, start: at };
  repeatUntil(MAX_CHAIN, () => {
    const unit = unitStart(scanned, state.at);
    if (unit === state.at) {
      return true;
    }
    state.start = unit;
    const dot = trimmedEnd(scanned, unit);
    state.at = trimmedEnd(scanned, code[dot - 2] === '?' ? dot - 2 : dot - 1);
    return code[dot - 1] !== '.';
  });
  return state.start;
}

export function dotReceiver(scanned: TestScanned, offset: number): Receiver | undefined {
  const { code } = scanned;
  const before = trimmedEnd(scanned, offset);
  if (code[before - 1] !== '.') {
    return undefined;
  }
  const end = code[before - 2] === '?' ? before - 2 : before - 1;
  const start = receiverStart(scanned, end);
  return start === trimmedEnd(scanned, end)
    ? undefined
    : { start, end, text: code.slice(start, end).trim() };
}

export function reportOffset(scanned: TestScanned, offset: number): number {
  return dotReceiver(scanned, offset)?.start ?? offset;
}

export function usedAgain(scanned: TestScanned, later: Span, expression: string): boolean {
  const wanted = squeezed(expression);
  const rest = squeezed(scanned.code.slice(later.start, later.end));
  return new RegExp(String.raw`(?<![\w.])${escapeRegExp(wanted)}(?!\w)`, 'u').test(rest);
}

export function isLast(scanned: TestScanned, close: number): boolean {
  const next = scanned.code[skipSpace(scanned.code, close + 1)];
  return next !== '.' && next !== '?';
}
