import type { SpawnSyncReturns } from 'node:child_process';
import { KILL_REMEDY } from './memory/memory-kills.mts';

const NODE_NOTICE =
  /^\(node:\d+\) (?:\[DEP\d+\] )?(?!UnhandledPromiseRejection)[A-Za-z]*Warning: /u;
const CARRIES_ERROR = /\b[A-Za-z]*Error\b/u;
const TRACE_HINT = /^\(Use `node --trace-/u;

type OutputText = string | Buffer | undefined;

export type ProcessOutput = { readonly stderr?: OutputText; readonly stdout?: OutputText };

export type ProcessResult = ProcessOutput & {
  readonly [Key in 'status' | 'signal']?: SpawnSyncReturns<string>[Key] | undefined;
};

function isNotice(line: string): boolean {
  return TRACE_HINT.test(line) || (NODE_NOTICE.test(line) && !CARRIES_ERROR.test(line));
}

function withoutWarnings(text: OutputText): string {
  return String(text ?? '')
    .split(/\r?\n/u)
    .filter((line) => !isNotice(line.trim()))
    .join('\n')
    .trim();
}

export function failureDetail({ stderr, stdout }: ProcessOutput): string {
  return withoutWarnings(stderr) || String(stdout ?? '').trim();
}

export function signalEnd(signal: string): string {
  return signal === 'SIGKILL'
    ? `was killed by SIGKILL (${KILL_REMEDY})`
    : `was terminated by ${signal}`;
}

export function describeProcessEnd(
  name: string,
  result: ProcessResult,
  {
    where,
    detail = failureDetail(result),
  }: { readonly where?: string; readonly detail?: string } = {},
): string {
  const place = where === undefined ? '' : ` in ${where}`;
  if (typeof result.signal === 'string') {
    return `${name} ${signalEnd(result.signal)}${place}${detail === '' ? '' : `: ${detail}`}`;
  }
  return `${name} exited with ${String(result.status)}${place}: ${detail || 'no diagnostic output'}`;
}
