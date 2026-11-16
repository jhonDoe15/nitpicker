import { spawnSync } from 'node:child_process';
import type { SpawnOptions, SpawnResult } from './process-types.mts';

export function spawnText(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): SpawnResult {
  return spawnSync(command, args, { ...options, encoding: 'utf8' });
}
