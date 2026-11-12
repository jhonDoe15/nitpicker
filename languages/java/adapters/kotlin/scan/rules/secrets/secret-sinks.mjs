import { splitArguments } from '../../kotlin-source.mjs';
import { logCalls } from '../../log-calls.mjs';

const SINKS = [
  { pattern: /\bSystem\s*\.\s*(?:out|err)\s*\.\s*(?:println|print|printf|format)\s*\(/g },
  { pattern: /\bTimber(?:\s*\.\s*tag\s*\([^()\n]*\))?\s*\.\s*(?:v|d|i|w|e|wtf|log)\s*\(/g },
  { pattern: /\bthrow\s+[\w.]+\s*\(/g },
  { pattern: /(?<![\w.])error\s*\(/g },
  { pattern: /\.\s*addArgument\s*\(/g },
  { pattern: /\.\s*addKeyValue\s*\(/g, keyed: true },
  { pattern: /\bMDC\s*\.\s*put\s*\(/g, keyed: true },
];

function loggedArguments(call) {
  const message =
    call.lambda === undefined ? [] : [{ start: call.lambda.open + 1, end: call.lambda.close }];
  return [...call.arguments, ...message];
}

function sinkCalls(code, { pattern, keyed = false }) {
  return [...code.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { start: match.index, arguments: splitArguments(code, open).parts, keyed };
  });
}

export function secretSinks(code) {
  const logged = logCalls(code, { console: true }).map((call) => ({
    start: call.start,
    arguments: loggedArguments(call),
    keyed: false,
  }));
  return [...logged, ...SINKS.flatMap((sink) => sinkCalls(code, sink))];
}
