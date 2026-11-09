import { existsSync } from 'node:fs';
import path from 'node:path';
import { sameBuildInputs } from './build-inputs.mjs';

export const PIT_HISTORY_DIRECTORY = 'nitpicker-pit-history';
const MAVEN_HISTORY_FILE = 'test.history';

function readsBaseHistory({ snapshot, baselineRoot }) {
  return snapshot === 'head' && baselineRoot !== undefined;
}

function reusableBase(policy, projectRoot) {
  return readsBaseHistory(policy) && sameBuildInputs(projectRoot, policy.baselineRoot)
    ? policy.baselineRoot
    : undefined;
}

export function pitHistoryOf(policy = {}, projectRoot) {
  return {
    snapshot: policy.snapshot,
    baselineRoot: reusableBase(policy, projectRoot),
    projectRoot,
  };
}

export function pitHistoryProperties(policy = {}, projectRoot) {
  if (policy.snapshot === 'base') {
    return ['-Pnitpicker.pit.recordHistory=true'];
  }
  const baseRoot = reusableBase(policy, projectRoot);
  return baseRoot === undefined ? [] : [`-Pnitpicker.pit.historyRoot=${baseRoot}`];
}

export function pitHistoryArguments(history, buildDirectory) {
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
