import { projectFlags } from '../engine-arguments.mts';
import { levelFlag } from './check-levels.mts';

const LEVEL_PREFIX = '-Xep:';

function supported(flag: string): boolean {
  return flag.startsWith(LEVEL_PREFIX) && levelFlag(flag) !== undefined;
}

/** The first project Error Prone option the engine cannot follow, if any. */
export function unsupportedOption(head: readonly string[]): string | undefined {
  return projectFlags(head).find((flag) => !supported(flag));
}
