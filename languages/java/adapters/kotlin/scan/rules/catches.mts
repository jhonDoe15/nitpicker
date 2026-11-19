import { escapeRegExp } from '../typed/typed-scan.mts';
import { closingIndex, enclosingOpen, openBrackets, splitArguments } from '../kotlin-source.mts';
import { reportingCalls, withoutCalls } from '../log-calls.mts';
import { leadingDeclaration } from '../parameters/declaration-header.mts';
import { isRetry } from '../loops.mts';
import type { Scanned } from '../typed/scan-shapes.mts';
import type { ReportedCall } from '../log-calls.mts';
import type { Block } from '../typed/rule-shapes.mts';

type Handler = { index: number; open: number; close: number; name: string; type: string };
type Flagged = { rule: string; offset: number; subject: string };

const INTERRUPTED = /^\s*(?:java\.lang\.)?InterruptedException\??\s*$/;
const CATCH = /\bcatch\s*\(\s*([A-Za-z_]\w*|`[^`]+`)\s*:([^)]*)\)\s*\{/g;
const ERROR_CALLS = [
  'status',
  'internalServerError',
  'badRequest',
  'notFound',
  'unprocessableEntity',
  'sendError',
  'exitProcess',
  'exit',
  'respond',
  'respondText',
  'ResponseEntity',
  String.raw`Result\s*\.\s*failure`,
];
const ERROR_RESPONSE = new RegExp(String.raw`\b(?:${ERROR_CALLS.join('|')})\s*[.(<]`);
const FAILS = /(?<![\w.])(?:error|TODO|fail)\s*\(|\bensureActive\s*\(/;
const FUNCTION = /(?<![\w.])fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/g;
const HIDING_MODIFIERS = new Set(['private', 'internal', 'protected', 'override']);
const BUILDER_NAME = /^(?:set|with)[A-Z]|^(?:of|from|valueOf|builder)$/;
const TYPE_KEYWORD = /(?<![\w.:])(?:class|object|interface)\b/g;
const PACKAGE_OR_IMPORT = /^[ \t]*(?:package|import)\b.*$/gm;
const CONTINUATION = /^\s*(?:[.?:&|+\-*/%]|else\b|as\b)/;
const HEADER_START = /[;{}]/g;
const BOOLEAN_PARAMETER =
  /^\s*(?:vararg\s+)?(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*:\s*Boolean\s*(?:=.*)?$/s;

const CATCH_MESSAGES = {
  CatchOnlyLogsOrReturnsDefault:
    'Rethrow it with the cause (`throw OrderException(message, e)`), return a failure result that carries the exception (`Result.failure(e)`), or answer with an error response: this catch only logs the failure or returns a default, and carries on.',
  BooleanFlagParameter:
    'Split the function into two functions named for each behavior, or pass an enum or a small data class: this boolean parameter switches the function between two behaviors, which makes the call site unreadable.',
};

function tryBlockBefore(code: string, catchIndex: number): Block | undefined {
  const close = code.slice(0, catchIndex).trimEnd().length - 1;
  if (code[close] !== '}') {
    return undefined;
  }
  const open = enclosingOpen(code, close);
  return /\btry\s*$/.test(code.slice(0, open)) ? { open, close } : undefined;
}

function handles(body: string, name: string): boolean {
  if (/\bthrow\b/.test(body) || ERROR_RESPONSE.test(body) || FAILS.test(body)) {
    return true;
  }
  return name !== '_' && new RegExp(`(?<![\\w.])${escapeRegExp(name)}\\b`).test(body);
}

function onlyLogs(
  code: string,
  { index, open, close, name, type }: Handler,
  calls: ReportedCall[],
): boolean {
  const tryBlock = tryBlockBefore(code, index);
  return (
    INTERRUPTED.test(type) ||
    !(
      code.slice(open + 1, close).trim() === '' ||
      handles(withoutCalls(code, { from: open + 1, to: close }, calls), name.replaceAll('`', '')) ||
      (tryBlock !== undefined && isRetry(code, tryBlock))
    )
  );
}

function swallowingHandlers(code: string): Handler[] {
  const calls = reportingCalls(code);
  return [...code.matchAll(CATCH)]
    .map((match) => {
      const open = match.index + match[0].length - 1;
      return {
        index: match.index,
        open,
        close: closingIndex(code, open),
        name: match[1] ?? '',
        type: match[2] ?? '',
      };
    })
    .filter((handler) => onlyLogs(code, handler, calls));
}

export function swallowedCatchBlocks(code: string): Set<number> {
  return new Set(swallowingHandlers(code).map(({ open }) => open));
}

export function catchOnlyLogs(scanned: Scanned): { rule: string; offset: number }[] {
  return swallowingHandlers(scanned.code)
    .filter(({ type }) => !INTERRUPTED.test(type))
    .map(({ index }) => ({
      rule: 'CatchOnlyLogsOrReturnsDefault',
      offset: index,
    }));
}

function expressionEnd(code: string, start: number): number {
  let depth = 0;
  for (const { 0: character, index } of code.slice(start).matchAll(/[()[\]{}\n]/g)) {
    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (depth <= 0 && !CONTINUATION.test(code.slice(start + index + 1))) {
      return start + index;
    }
  }
  return code.length;
}

function bodyOf(code: string, close: number): string | undefined {
  const after = /^\s*(?::[^={]*)?(\{|=)/.exec(code.slice(close + 1));
  if (after === null) {
    return undefined;
  }
  const start = close + 1 + after[0].length - 1;
  if (after[1] === '{') {
    return code.slice(start, closingIndex(code, start));
  }
  return code.slice(start, expressionEnd(code, start));
}

function branchConditions(line: string): string[] {
  const arrow = line.indexOf('->');
  const condition = arrow === -1 ? '' : line.slice(0, arrow);
  return condition.trim() === '' || /[{}]/.test(condition) ? [] : condition.split(',');
}

function conditions(body: string): string[] {
  const heads = [...body.matchAll(/\b(?:if|when|while)\s*\(/g)].map((match) => {
    const open = match.index + match[0].length - 1;
    return body.slice(open + 1, closingIndex(body, open));
  });
  const branches = [...body.matchAll(/\bwhen\s*\{/g)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const block = body.slice(open + 1, closingIndex(body, open));
    return block.split('\n').flatMap(branchConditions);
  });
  return [...heads, ...branches];
}

function isShadowed(body: string, flag: string): boolean {
  return new RegExp(
    String.raw`\b(?:val|var)\s+${escapeRegExp(flag)}\b|\bfor\s*\([^)]*\b${escapeRegExp(flag)}\b[^)]*\bin\b|(?<!\bwhen\s*)\{\s*(?:\w+\s*,\s*)*${escapeRegExp(flag)}\s*(?:,\s*\w+\s*)*->`,
  ).test(body);
}

function isFlagOperand(operand: string, flag: string): boolean {
  const bare = operand.replace(/^[\s!(]+|[\s)]+$/g, '');
  return (
    bare === flag ||
    new RegExp(
      String.raw`^${escapeRegExp(flag)}\s*[=!]=\s*(?:true|false)$|^(?:true|false)\s*[=!]=\s*${escapeRegExp(flag)}$`,
    ).test(bare)
  );
}

function switchesOn(body: string, flag: string): boolean {
  return (
    !isShadowed(body, flag) &&
    conditions(body).some((condition) =>
      condition.split(/&&|\|\|/).some((operand) => isFlagOperand(operand, flag)),
    )
  );
}

function headerBefore(code: string, open: number): { start: number; text: string } {
  const starts = [...code.slice(0, open).matchAll(HEADER_START)];
  const start = (starts.at(-1)?.index ?? -1) + 1;
  return { start, text: code.slice(start, open) };
}

function hidesFunctions(code: string, open: number): boolean {
  const { start, text } = headerBefore(code, open);
  const type = [...text.matchAll(TYPE_KEYWORD)].at(-1);
  if (type === undefined) {
    return true;
  }
  const { modifiers } = leadingDeclaration(code, start + type.index);
  const anonymous =
    type[0] === 'object' &&
    !modifiers.includes('companion') &&
    /^\s*(?::|$)/.test(text.slice(type.index + type[0].length));
  return anonymous || modifiers.some((modifier) => HIDING_MODIFIERS.has(modifier));
}

function isReachableFromOutside(code: string, offset: number): boolean {
  return !openBrackets(code, offset).some((open) => hidesFunctions(code, open));
}

function isHiddenFunction(code: string, offset: number): boolean {
  const { modifiers } = leadingDeclaration(code, offset);
  return (
    modifiers.some((modifier) => HIDING_MODIFIERS.has(modifier)) ||
    !isReachableFromOutside(code, offset)
  );
}

export function booleanFlags(scanned: Scanned): Flagged[] {
  const code = scanned.code.replaceAll(PACKAGE_OR_IMPORT, (line) => ' '.repeat(line.length));
  return [...code.matchAll(FUNCTION)].flatMap((match) => {
    const [, functionName = ''] = match;
    if (BUILDER_NAME.test(functionName) || isHiddenFunction(code, match.index)) {
      return [];
    }
    const open = match.index + match[0].length - 1;
    const { close, parts } = splitArguments(code, open);
    const body = bodyOf(code, close);
    if (body === undefined) {
      return [];
    }
    return parts.flatMap((part) => {
      const text = code.slice(part.start, part.end);
      const flag = text.includes('@') ? undefined : (BOOLEAN_PARAMETER.exec(text) ?? undefined);
      const flagName = flag?.[1] ?? '';
      return flag !== undefined && switchesOn(body, flagName)
        ? [
            {
              rule: 'BooleanFlagParameter',
              offset: part.start + text.search(/\S/),
              subject: `${functionName}(${flagName})`,
            },
          ]
        : [];
    });
  });
}

export const kotlinSourceRules = { messages: CATCH_MESSAGES, main: [catchOnlyLogs, booleanFlags] };
