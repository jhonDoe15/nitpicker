import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

function isCallable(value: unknown): value is () => void {
  return typeof value === 'function';
}

export function collectGarbage(): void {
  setFlagsFromString('--expose-gc');
  const collect: unknown = runInNewContext('gc');
  setFlagsFromString('--no-expose-gc');
  if (isCallable(collect)) {
    collect();
  }
}
