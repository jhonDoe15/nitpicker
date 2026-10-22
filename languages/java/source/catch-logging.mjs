import { closingIndex } from './brackets.mjs';
import { isFailureCall, logCalls, topLevelArguments } from './loggers.mjs';

export const CATCH_LOG_RULE = 'catch-log-without-exception';
export const CATCH_LOG_MESSAGE =
  'Pass the caught exception to the logger as its own argument so the stack trace is kept (log.error("what failed", e), or logger.error(e) { "what failed" }). e.message, e.toString() and a string template of the exception drop it.';

const CATCH = /\bcatch\s*\(([^()]*)\)\s*\{/g;
const CAUGHT_NAME = { kotlin: /^\s*(\w+)\s*:/, java: /(\w+)\s*$/ };
const IGNORED_NAME = /^(?:_|ignored?\w*|expected\w*|unused\w*)$/i;

function catchBlocks(code, language) {
  return [...code.matchAll(CATCH)].flatMap((match) => {
    const name = CAUGHT_NAME[language].exec(match[1])?.[1];
    const open = match.index + match[0].length - 1;
    const close = closingIndex(code, open);
    return name === undefined || IGNORED_NAME.test(name) || close === -1
      ? []
      : [{ name, open, close }];
  });
}

function innermost(blocks, index) {
  return blocks
    .filter(({ open, close }) => index > open && index < close)
    .sort((left, right) => right.open - left.open)[0];
}

function isException(argument, name) {
  const value = argument
    .replace(/^\w+\s*=\s*/, '')
    .replace(/^\(\s*[\w.<>?]+\s*\)\s*/, '')
    .replace(/\s+as\??\s+[\w.<>?]+$/, '')
    .trim();
  return value === name;
}

function passesException(call, name) {
  const cause = new RegExp(String.raw`\b(?:setCause|withThrowable|cause\s*=)\s*\(?\s*${name}\b`);
  return call.args.some((argument) => isException(argument, name)) || cause.test(call.text);
}

function thrownCauses(rest) {
  const call = /^\s*(?:new\s+)?[\w.<>?]+\s*\(/.exec(rest);
  if (call === null) {
    return [/^\s*(\w+)/.exec(rest)?.[1] ?? ''];
  }
  const open = call[0].length - 1;
  return topLevelArguments(rest.slice(open + 1, closingIndex(rest, open)));
}

function rethrows(body, name) {
  return [...body.matchAll(/\bthrow\b/g)].some((match) =>
    thrownCauses(body.slice(match.index + 'throw'.length)).some((argument) =>
      isException(argument, name),
    ),
  );
}

export function catchLogViolations(code, language, { reportedElsewhere = new Set() } = {}) {
  const blocks = catchBlocks(code, language);
  return logCalls(code)
    .filter(isFailureCall)
    .flatMap((call) => {
      const block = innermost(blocks, call.index);
      const handled =
        block === undefined ||
        reportedElsewhere.has(block.open) ||
        passesException(call, block.name) ||
        rethrows(code.slice(block.open, block.close), block.name);
      return handled ? [] : [{ receiver: call.receiver, level: call.level, caught: block.name }];
    });
}
