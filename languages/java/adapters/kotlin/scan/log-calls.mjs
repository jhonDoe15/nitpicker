import { splitArguments } from './kotlin-source.mjs';

const LOG_METHODS =
  'trace|debug|info|warn|warning|error|fatal|severe|fine|finer|finest|log|atTrace|atDebug|atInfo|atWarn|atError';
const LOG_CALL = new RegExp(`\\b([A-Za-z_]\\w*)\\s*\\.\\s*(${LOG_METHODS})\\s*\\(`, 'g');
const CONSOLE_CALL = /(?<![\w.])(println|print)\s*\(/g;
const LOGGER_NAME = /^(?:log|logger|LOG|LOGGER|_log|_logger)$|(?:Log|Logger|_LOG|_LOGGER)$/;

function isLoggerName(name) {
  return LOGGER_NAME.test(name);
}

function callsOf(code, pattern, accept) {
  return [...code.matchAll(pattern)].flatMap((match) => {
    if (!accept(match)) {
      return [];
    }
    const open = match.index + match[0].length - 1;
    const { close, parts } = splitArguments(code, open);
    return [{ start: match.index, open, close, method: match.at(-1), arguments: parts }];
  });
}

export function logCalls(code, { console = false } = {}) {
  const logged = callsOf(code, LOG_CALL, ([, receiver]) => isLoggerName(receiver));
  return console ? [...logged, ...callsOf(code, CONSOLE_CALL, () => true)] : logged;
}

export function withoutLogCalls(code, from, to) {
  const segment = code.slice(from, to);
  const calls = [
    ...logCalls(segment, { console: true }),
    ...callsOf(segment, /\b\w+\s*\.\s*(printStackTrace)\s*\(/g, () => true),
  ];
  let kept = segment;
  for (const call of calls.toSorted((left, right) => right.start - left.start)) {
    kept = `${kept.slice(0, call.start)}${' '.repeat(call.close + 1 - call.start)}${kept.slice(call.close + 1)}`;
  }
  return kept;
}
