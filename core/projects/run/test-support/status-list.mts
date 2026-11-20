import type { MonorepoRun } from './monorepo-harness.mts';

export function statusList(result: MonorepoRun): string[] {
  return result.json('summary.json').projects.map(({ status }) => status);
}
