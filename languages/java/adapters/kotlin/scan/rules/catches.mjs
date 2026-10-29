import { closingIndex, enclosingOpen, splitArguments } from '../kotlin-source.mjs';
import { reportingCalls, withoutCalls } from '../log-calls.mjs';
import { isRetry } from '../loops.mjs';

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
const HIDDEN = /\b(?:private|internal|protected|override)\b/;
const BUILDER_NAME = /^(?:set|with)[A-Z]|^(?:of|from|valueOf|builder)$/;
const BOOLEAN_PARAMETER =
  /^\s*(?:vararg\s+)?(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*:\s*Boolean\??\s*(?:=.*)?$/s;

export const CATCH_MESSAGES = {
  CatchOnlyLogsOrReturnsDefault:
    'Rethrow it with the cause (`throw OrderException(message, e)`), return a failure result that carries the exception (`Result.failure(e)`), or answer with an error response: this catch only logs the failure or returns a default, and carries on.',
  BooleanFlagParameter:
    'Split the function into two functions named for each behavior, or pass an enum or a small data class: this boolean parameter switches the function between two behaviors, which makes the call site unreadable.',
};

function tryBlockBefore(code, catchIndex) {
  const close = code.slice(0, catchIndex).trimEnd().length - 1;
  if (code[close] !== '}') {
    return undefined;
  }
  const open = enclosingOpen(code, close);
  return /\btry\s*$/.test(code.slice(0, open)) ? { open, close } : undefined;
}

function handles(body, name) {
  if (/\bthrow\b/.test(body) || ERROR_RESPONSE.test(body) || FAILS.test(body)) {
    return true;
  }
  return name !== '_' && new RegExp(`(?<![\\w.])${name}\\b`).test(body);
}

function onlyLogs(code, { index, open, close, name, type }, calls) {
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

function swallowingHandlers(code) {
  const calls = reportingCalls(code);
  return [...code.matchAll(CATCH)]
    .map((match) => {
      const open = match.index + match[0].length - 1;
      return {
        index: match.index,
        open,
        close: closingIndex(code, open),
        name: match[1],
        type: match[2],
      };
    })
    .filter((handler) => onlyLogs(code, handler, calls));
}

export function swallowedCatchBlocks(code) {
  return new Set(swallowingHandlers(code).map(({ open }) => open));
}

export function catchOnlyLogs(scanned) {
  return swallowingHandlers(scanned.code)
    .filter(({ type }) => !INTERRUPTED.test(type))
    .map(({ index }) => ({
      rule: 'CatchOnlyLogsOrReturnsDefault',
      offset: index,
    }));
}

function bodyOf(code, close) {
  const after = /^\s*(?::[^={]*)?(\{|=)/.exec(code.slice(close + 1));
  if (after === null) {
    return undefined;
  }
  const start = close + 1 + after[0].length - 1;
  if (after[1] === '{') {
    return code.slice(start, closingIndex(code, start));
  }
  const newline = code.indexOf('\n', start);
  return code.slice(start, newline === -1 ? undefined : newline);
}

function conditions(body) {
  const heads = [...body.matchAll(/\b(?:if|when|while)\s*\(/g)].map((match) => {
    const open = match.index + match[0].length - 1;
    return body.slice(open + 1, closingIndex(body, open));
  });
  return heads;
}

function switchesOn(body, flag) {
  const bare = new RegExp(`(?<![\\w.])${flag}(?!\\s*(?:[.(\\[]|==|!=|[<>]=?|\\?\\.))\\b`);
  return conditions(body).some((condition) => {
    const operands = condition.split(/&&|\|\|/).map((part) => part.trim().replace(/^!+\s*/, ''));
    return operands.some((operand) => operand === flag) && bare.test(condition);
  });
}

export function booleanFlags(scanned) {
  const { code } = scanned;
  return [...code.matchAll(FUNCTION)].flatMap((match) => {
    const lineStart = code.lastIndexOf('\n', match.index) + 1;
    const modifiers = code.slice(lineStart, match.index);
    if (HIDDEN.test(modifiers) || BUILDER_NAME.test(match[1])) {
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
      return flag !== undefined && switchesOn(body, flag[1])
        ? [
            {
              rule: 'BooleanFlagParameter',
              offset: part.start + text.search(/\S/),
              subject: `${match[1]}(${flag[1]})`,
            },
          ]
        : [];
    });
  });
}
