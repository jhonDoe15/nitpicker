import { existsSync } from 'node:fs';
import path from 'node:path';
import type { JavaPolicy } from '../../adapters/typed/java-values.mts';
import { sameBuildInputs } from './build-inputs.mts';

type HistoryPolicy = {
  readonly snapshot?: string | undefined;
  readonly baselineRoot?: string | undefined;
};
export type PitHistory = {
  readonly snapshot: string | undefined;
  readonly baselineRoot: string | undefined;
  readonly projectRoot: string | undefined;
};

export const PIT_HISTORY_DIRECTORY = 'nitpicker-pit-history';
const MAVEN_HISTORY_FILE = 'test.history';

function readsBaseHistory(
  policy: HistoryPolicy,
): policy is { readonly snapshot: 'head'; readonly baselineRoot: string } {
  return policy.snapshot === 'head' && policy.baselineRoot !== undefined;
}

function reusableBase(policy: HistoryPolicy, projectRoot: string | undefined): string | undefined {
  return readsBaseHistory(policy) && sameBuildInputs(projectRoot, policy.baselineRoot)
    ? policy.baselineRoot
    : undefined;
}

export function pitHistoryOf(policy: JavaPolicy = {}, projectRoot?: string): PitHistory {
  return {
    snapshot: policy.snapshot,
    baselineRoot: reusableBase(policy, projectRoot),
    projectRoot,
  };
}

export function pitHistoryProperties(policy: JavaPolicy = {}, projectRoot?: string): string[] {
  if (policy.snapshot === 'base') {
    return ['-Pnitpicker.pit.recordHistory=true'];
  }
  const baseRoot = reusableBase(policy, projectRoot);
  return baseRoot === undefined ? [] : [`-Pnitpicker.pit.historyRoot=${baseRoot}`];
}

export function pitHistoryArguments(
  history: PitHistory | undefined,
  buildDirectory: string | undefined,
): string[] {
  if (history === undefined || buildDirectory === undefined) {
    return [];
  }
  const file = path.join(buildDirectory, PIT_HISTORY_DIRECTORY, MAVEN_HISTORY_FILE);
  if (history.snapshot === 'base') {
    return ['--historyOutputLocation', file];
  }
  if (!readsBaseHistory(history) || history.projectRoot === undefined) {
    return [];
  }
  const baseRoot = path.resolve(history.baselineRoot);
  const recorded = path.resolve(baseRoot, path.relative(history.projectRoot, file));
  if (!recorded.startsWith(`${baseRoot}${path.sep}`)) {
    return [];
  }
  return existsSync(recorded) ? ['--historyInputLocation', recorded] : [];
}
