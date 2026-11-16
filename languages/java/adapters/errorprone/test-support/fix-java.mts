import { fixWorkingTree } from '../../../../../core/fix/run-fix.mts';
import type { FixOutcome } from '../../../../../core/fix/typed/fix-types.mts';

export function fixJava(
  repository: { readonly root: string },
  environment: Readonly<Record<string, string>>,
  selectedRules?: readonly string[],
): FixOutcome {
  return fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: undefined,
    spawnEnvironment: undefined,
    headPolicy: { exclude: [], conventions: { 'java.formatter': 'none' } },
    config: { preset: 'java' },
    scope: undefined,
    environment,
    dryRun: false,
    selectedRules,
    allFiles: false,
    recipes: undefined,
    analyzeFixes: undefined,
    verifyMode: 'narrow',
  });
}
