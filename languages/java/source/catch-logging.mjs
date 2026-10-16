import { closingIndex, logCalls } from './loggers.mjs';

export const CATCH_LOG_RULE = 'catch-log-without-exception';
export const CATCH_LOG_MESSAGE =
  'Pass the caught exception to the logger as its own argument so the stack trace is kept (log.error("what failed", e), or logger.error(e) { "what failed" }). e.message, e.toString() and a string template of the exception drop it. If this log is right without the exception, add an "exceptions" entry for rule catch-log-without-exception in nitpicker.config.json.';

const CATCH_PATTERNS = {
  kotlin: /\bcatch\s*\(\s*(\w+)\s*:[^)]*\)\s*\{/g,
  java: /\bcatch\s*\(\s*(?:final\s+)?[\w.|\s<>?,]+?\s+(\w+)\s*\)\s*\{/g,
};
const IGNORED_NAME = /^(?:_|ignored?\w*|expected\w*|unused\w*)$/i;

function catchBlocks(code, language) {
  return [...code.matchAll(CATCH_PATTERNS[language])]
    .filter((match) => !IGNORED_NAME.test(match[1]))
    .flatMap((match) => {
      const open = match.index + match[0].length - 1;
      const close = closingIndex(code, open);
      return close === -1 ? [] : [{ name: match[1], open, close }];
    });
}

function innermost(blocks, index) {
  return blocks
    .filter(({ open, close }) => index > open && index < close)
    .sort((left, right) => right.open - left.open)[0];
}

function passesException(call, name) {
  const direct = new RegExp(String.raw`^(?:\w+\s*=\s*)?${name}$`);
  return (
    call.args.some((argument) => direct.test(argument)) ||
    new RegExp(String.raw`\bcause\s*=\s*${name}\b`).test(call.text)
  );
}

export function catchLogViolations(code, language) {
  const blocks = catchBlocks(code, language);
  return logCalls(code).flatMap((call) => {
    const block = innermost(blocks, call.index);
    return block === undefined || passesException(call, block.name)
      ? []
      : [{ receiver: call.receiver, level: call.level, caught: block.name }];
  });
}
