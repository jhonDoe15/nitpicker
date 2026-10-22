import { logCalls as loggerCalls } from '../../../source/loggers.mjs';
import { splitArguments } from './kotlin-source.mjs';

const CONSOLE_CALL = /(?<![\w.])(println|print)\s*\(/g;
const STACK_TRACE = /\b\w+\s*\.\s*(printStackTrace)\s*\(/g;

function plainCalls(code, pattern) {
  return [...code.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    const { close, parts } = splitArguments(code, open);
    return { start: match.index, end: close + 1, method: match[1], arguments: parts };
  });
}

export function logCalls(code, { console = false } = {}) {
  const logged = loggerCalls(code).map((call) => ({
    start: call.index,
    end: call.index + call.text.length,
    receiver: call.receiver,
    method: call.level,
    arguments: code[call.open] === '(' ? splitArguments(code, call.open).parts : [],
    lambda: call.lambda,
  }));
  return console ? [...logged, ...plainCalls(code, CONSOLE_CALL)] : logged;
}

export function reportingCalls(code) {
  return [...logCalls(code, { console: true }), ...plainCalls(code, STACK_TRACE)];
}

export function withoutCalls(code, { from, to }, calls) {
  let kept = code.slice(from, to);
  const inside = calls.filter(({ start, end }) => start >= from && end <= to);
  for (const call of inside.toSorted((left, right) => right.start - left.start)) {
    const start = call.start - from;
    const end = call.end - from;
    kept = `${kept.slice(0, start)}${' '.repeat(end - start)}${kept.slice(end)}`;
  }
  return kept;
}
