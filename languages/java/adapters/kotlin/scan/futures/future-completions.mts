import { escapeRegExp } from '../typed/typed-scan.mts';
import { closingIndex, enclosingOpen } from '../kotlin-source.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

type Region = { open: number; end: number };
type RegionScope = { code: string; block: Region };

const RULE = 'FutureWithoutException';
const BUILDERS = /(?<![\w$])(?:suspendCancellableCoroutine|suspendCoroutine)(?![\w$])/g;
const CREATED = /(?<![\w$])va[lr][ \t]+([A-Za-z_]\w*)(?![\w$])/g;
const FUTURE_TYPE = /^(?:CompletableDeferred|CompletableFuture)(?![\w$])/;
const LAMBDA_PARAMETER = /^\{\s*([A-Za-z_]\w*)\s*->/;
const FUNCTION_HEADER = /(?<![\w$])fun(?![\w$])/;
const FAILING_CALLS = 'completeExceptionally|cancel|obtrudeException|orTimeout|completeOnTimeout';
const FAILING_REFERENCES = 'completeExceptionally|cancel|obtrudeException';

const MESSAGES = {
  [RULE]:
    'Resume or complete it on the failure path too: call `continuation.resumeWithException(error)` or `deferred.completeExceptionally(error)` from the error callback, or use an API that throws by itself, such as a suspending client call or `future.await()` from kotlinx-coroutines. This continuation or future is resumed only with a value from a callback, so when the work behind the callback fails it never resumes and the caller waits forever.',
};

export function skipSpace(code: string, from: number): number {
  const offset = code.slice(from).search(/\S/);
  return offset === -1 ? code.length : from + offset;
}

function skipGenerics(code: string, from: number): number {
  const start = skipSpace(code, from);
  if (code[start] !== '<') {
    return start;
  }
  const counter = { depth: 0 };
  for (const { index, 0: bracket } of code.slice(start).matchAll(/[<>]/g)) {
    counter.depth += bracket === '<' ? 1 : -1;
    if (counter.depth === 0) {
      return skipSpace(code, start + index + 1);
    }
  }
  return code.length;
}

function blockOf(code: string, open: number): Region {
  return { open, end: closingIndex(code, open) };
}

function inCallback({ code, block }: RegionScope, offset: number, text: string): boolean {
  return text.includes('::') || enclosingOpen(code, offset) !== block.open;
}

function receiverPatterns(name: string): { settles: RegExp; fails: RegExp; handed: RegExp } {
  return {
    settles: new RegExp(
      String.raw`(?<![\w$])${escapeRegExp(name)}\s*(?:\??\.\s*(?:resume|complete)\s*\(|::\s*(?:resume|complete)(?![\w$]))`,
      'g',
    ),
    fails: new RegExp(
      String.raw`(?<![\w$])${escapeRegExp(name)}\s*(?:\??\.\s*(?:resumeWithException|resumeWith|${FAILING_CALLS})\s*\(|::\s*(?:resumeWithException|resumeWith|${FAILING_REFERENCES})(?![\w$]))`,
    ),
    handed: new RegExp(
      String.raw`[(,\[]\s*${escapeRegExp(name)}\s*[,)\]]|(?<![=!<>])=\s*${escapeRegExp(name)}(?![\w$.?:(])|(?<![\w$])to\s+${escapeRegExp(name)}(?![\w$])`,
    ),
  };
}

function settledOnlyWithValue({ code, block }: RegionScope, name: string, from: number): boolean {
  const rest = code.slice(from, block.end);
  const patterns = receiverPatterns(name);
  if (patterns.fails.test(rest) || patterns.handed.test(rest)) {
    return false;
  }
  return [...rest.matchAll(patterns.settles)].some(({ index, 0: text }) =>
    inCallback({ code, block }, from + index, text),
  );
}

function builders(code: string): number[] {
  return [...code.matchAll(BUILDERS)]
    .filter(({ index, 0: text }) => {
      const open = skipGenerics(code, index + text.length);
      if (code[open] !== '{') {
        return false;
      }
      const name = LAMBDA_PARAMETER.exec(code.slice(open))?.[1] ?? 'it';
      return settledOnlyWithValue({ code, block: blockOf(code, open) }, name, open + 1);
    })
    .map(({ index }) => index);
}

function inFunction(code: string, offset: number): boolean {
  const opens = [enclosingOpen(code, offset)];
  for (const open of opens) {
    if (open > 0) {
      opens.push(enclosingOpen(code, open));
    }
  }
  return opens
    .filter((open) => open >= 0)
    .some((open) => {
      const before = Math.max(code.lastIndexOf('}', open - 1), code.lastIndexOf(';', open - 1));
      return FUNCTION_HEADER.test(code.slice(before + 1, open));
    });
}

function createdFuture(code: string, match: RegExpExecArray): number | undefined {
  const assignment = skipSpace(code, match.index + match[0].length);
  const typed = code[assignment] === ':' ? code.indexOf('=', assignment) : assignment;
  if (typed === -1 || code[typed] !== '=' || code[typed + 1] === '=') {
    return undefined;
  }
  const start = skipSpace(code, typed + 1);
  const type = FUTURE_TYPE.exec(code.slice(start));
  if (type === null) {
    return undefined;
  }
  const call = skipGenerics(code, start + type[0].length);
  const close = skipSpace(code, call + 1);
  return code[call] === '(' && code[close] === ')' ? close + 1 : undefined;
}

function futures(code: string): number[] {
  return [...code.matchAll(CREATED)]
    .filter((match) => {
      const end = createdFuture(code, match);
      const open = enclosingOpen(code, match.index);
      return (
        end !== undefined &&
        open !== -1 &&
        inFunction(code, match.index) &&
        settledOnlyWithValue({ code, block: blockOf(code, open) }, match[1] ?? '', end)
      );
    })
    .map(({ index }) => index);
}

export function futuresWithoutException(scanned: Scanned): { rule: string; offset: number }[] {
  const { code } = scanned;
  return [...builders(code), ...futures(code)]
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: RULE, offset }));
}

export const kotlinSourceRules = { messages: MESSAGES, main: [futuresWithoutException] };
