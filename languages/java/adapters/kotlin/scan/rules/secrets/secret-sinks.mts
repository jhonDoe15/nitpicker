import { splitArguments } from '../../kotlin-source.mts';
import { logCalls } from '../../log-calls.mts';

import type { ReportedCall } from '../../log-calls.mts';
import type { Span } from '../../typed/rule-shapes.mts';

export type SinkCall = { start: number; arguments: Span[]; keyed: boolean };
type SinkPattern = { pattern: RegExp; keyed?: true };

const SINKS: SinkPattern[] = [
  { pattern: /\bSystem\s*\.\s*(?:out|err)\s*\.\s*(?:println|print|printf|format)\s*\(/g },
  { pattern: /\bTimber(?:\s*\.\s*tag\s*\([^()\n]*\))?\s*\.\s*(?:v|d|i|w|e|wtf|log)\s*\(/g },
  { pattern: /\bthrow\s+[\w.]+\s*\(/g },
  { pattern: /(?<![\w.])error\s*\(/g },
  { pattern: /\.\s*addArgument\s*\(/g },
  { pattern: /\.\s*addKeyValue\s*\(/g, keyed: true },
  { pattern: /\bMDC\s*\.\s*put\s*\(/g, keyed: true },
];

function loggedArguments(call: ReportedCall): Span[] {
  const message =
    call.lambda === undefined ? [] : [{ start: call.lambda.open + 1, end: call.lambda.close }];
  return [...call.arguments, ...message];
}

function sinkCalls(code: string, { pattern, keyed }: SinkPattern): SinkCall[] {
  return [...code.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    return {
      start: match.index,
      arguments: splitArguments(code, open).parts,
      keyed: keyed === true,
    };
  });
}

export function secretSinks(code: string): SinkCall[] {
  const logged = logCalls(code, { console: true }).map((call) => ({
    start: call.start,
    arguments: loggedArguments(call),
    keyed: false,
  }));
  return [...logged, ...SINKS.flatMap((sink) => sinkCalls(code, sink))];
}
