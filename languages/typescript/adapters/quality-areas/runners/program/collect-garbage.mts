import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

export function collectGarbage(): void {
  setFlagsFromString('--expose-gc');
  const collect: unknown = runInNewContext('gc');
  setFlagsFromString('--no-expose-gc');
  if (typeof collect === 'function') {
    collect();
  }
}
