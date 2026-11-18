import type { SpawnSyncReturns } from 'node:child_process';
import { parseJson } from '../../../../shared/values/readers.mts';

function missing() {
  const none = parseJson('null');
  if (none !== null) {
    throw new TypeError('Expected null');
  }
  return none;
}

export function spawnResult(fields: {
  readonly status?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly error?: Error;
}): SpawnSyncReturns<string> {
  const { status = missing(), stdout = '', stderr = '', error } = fields;
  return {
    pid: 0,
    output: [],
    status,
    signal: missing(),
    stdout,
    stderr,
    ...(error === undefined ? {} : { error }),
  };
}
