import { closingIndex, enclosingOpen, splitArguments } from '../kotlin-source.mjs';
import { reportingCalls, withoutCalls } from '../log-calls.mjs';
import { leadingDeclaration } from '../declaration-header.mjs';
import { isRetry } from '../loops.mjs';

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
const FUNCTION = /(?<![\w.])fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/g;
const HIDING_MODIFIERS = new Set(['private', 'internal', 'protected', 'override']);
const BUILDER_NAME = /^(?:set|with)[A-Z]|^(?:of|from|valueOf|builder)$/;
const TYPE_KEYWORD = /(?<![\w.:])(?:class|object|interface)\b/g;
const PACKAGE_OR_IMPORT = /^[ \t]*(?:package|import)\b.*$/gm;
const CONTINUATION = /^\s*(?:[.?:&|+\-*/%]|else\b|as\b)/;
const BRACE = /[{}]/g;
const HEADER_START = /[;{}]/g;
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

function handles(body, name, type) {
  if (/\bthrow\b/.test(body) || ERROR_RESPONSE.test(body)) {
    return true;
  }
  if (/InterruptedException/.test(type) && /\binterrupt\s*\(/.test(body)) {
    return true;
  }
  return name !== '_' && new RegExp(`(?<![\\w.])${name}\\b`).test(body);
}

function onlyLogs(code, { index, open, close, name, type }, calls) {
  const tryBlock = tryBlockBefore(code, index);
  return !(
    code.slice(open + 1, close).trim() === '' ||
    handles(
      withoutCalls(code, { from: open + 1, to: close }, calls),
      name.replaceAll('`', ''),
      type,
    ) ||
    (tryBlock !== undefined && isRetry(code, tryBlock))
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
  return swallowingHandlers(scanned.code).map(({ index }) => ({
    rule: 'CatchOnlyLogsOrReturnsDefault',
    offset: index,
  }));
}

function expressionEnd(code, start) {
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

function bodyOf(code, close) {
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

function branchConditions(line) {
  const arrow = line.indexOf('->');
  const condition = arrow === -1 ? '' : line.slice(0, arrow);
  return condition.trim() === '' || /[{}]/.test(condition) ? [] : condition.split(',');
}

function conditions(body) {
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

function isShadowed(body, flag) {
  return new RegExp(
    String.raw`\b(?:val|var)\s+${flag}\b|\bfor\s*\([^)]*\b${flag}\b[^)]*\bin\b|(?<!\bwhen\s*)\{\s*(?:\w+\s*,\s*)*${flag}\s*(?:,\s*\w+\s*)*->`,
  ).test(body);
}

function isFlagOperand(operand, flag) {
  const bare = operand.replace(/^[\s!(]+|[\s)]+$/g, '');
  return (
    bare === flag ||
    new RegExp(
      String.raw`^${flag}\s*[=!]=\s*(?:true|false)$|^(?:true|false)\s*[=!]=\s*${flag}$`,
    ).test(bare)
  );
}

function switchesOn(body, flag) {
  return (
    !isShadowed(body, flag) &&
    conditions(body).some((condition) =>
      condition.split(/&&|\|\|/).some((operand) => isFlagOperand(operand, flag)),
    )
  );
}

function headerBefore(code, open) {
  const starts = [...code.slice(0, open).matchAll(HEADER_START)];
  const start = starts.length === 0 ? 0 : starts.at(-1).index + 1;
  return { start, text: code.slice(start, open) };
}

function hidesFunctions(code, open) {
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

function openBraces(code, offset) {
  const open = [];
  for (const { index, 0: brace } of code.slice(0, offset).matchAll(BRACE)) {
    if (brace === '{') {
      open.push(index);
    } else {
      open.pop();
    }
  }
  return open;
}

function isReachableFromOutside(code, offset) {
  return !openBraces(code, offset).some((open) => hidesFunctions(code, open));
}

function isHiddenFunction(code, offset) {
  const { modifiers } = leadingDeclaration(code, offset);
  return (
    modifiers.some((modifier) => HIDING_MODIFIERS.has(modifier)) ||
    !isReachableFromOutside(code, offset)
  );
}

export function booleanFlags(scanned) {
  const code = scanned.code.replaceAll(PACKAGE_OR_IMPORT, (line) => ' '.repeat(line.length));
  return [...code.matchAll(FUNCTION)].flatMap((match) => {
    if (BUILDER_NAME.test(match[1]) || isHiddenFunction(code, match.index)) {
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
