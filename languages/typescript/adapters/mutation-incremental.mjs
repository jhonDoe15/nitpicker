import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';
export const MUTATION_INCREMENTAL_PATH = 'reports/quality/mutation/incremental.json';

export function reusableBaseMutationResults({ snapshot, baselineRoot, projectRoot }, layout) {
  if (snapshot !== 'head' || baselineRoot === undefined) return undefined;
  const baseResults = path.join(baselineRoot, MUTATION_INCREMENTAL_PATH);
  if (!existsSync(baseResults)) return undefined;
  return onlyMutatedSourcesAndTestsChanged({ baselineRoot, projectRoot }, layout)
    ? baseResults
    : undefined;
}

function onlyMutatedSourcesAndTestsChanged({ baselineRoot, projectRoot }, layout) {
  const baseCommit = gitOutput(baselineRoot, ['rev-parse', 'HEAD']);
  const projectPrefix = gitOutput(projectRoot, ['rev-parse', '--show-prefix']);
  if (baseCommit === undefined || projectPrefix === undefined) return false;
  const changed = gitOutput(projectRoot, [
    'diff',
    '--name-only',
    '--no-renames',
    baseCommit,
    'HEAD',
    '--',
    ':/',
  ]);
  if (changed === undefined) return false;
  return changed
    .split('\n')
    .filter((file) => file.length > 0)
    .every((file) => isMutatedSourceOrTest(file, projectPrefix, layout));
}

function isMutatedSourceOrTest(file, projectPrefix, layout) {
  if (!file.startsWith(projectPrefix)) return false;
  const projectFile = file.slice(projectPrefix.length);
  return layout.isSourceFile(projectFile) || layout.isRunnableTestFile(projectFile);
}

function gitOutput(cwd, arguments_) {
  const result = spawnSync('git', arguments_, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
