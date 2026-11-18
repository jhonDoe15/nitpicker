import type { FixOptions } from '../../../../core/fix/run-fix.mts';
import type { FixInvocation } from '../../../../core/fix/typed/fix-types.mts';

const ENVIRONMENT = { NITPICKER_GRADLE: '', NITPICKER_MAVEN: 'fake-mvn' };

type JavaFixRun = {
  readonly root: string;
  readonly executeFixCommand: (invocation: FixInvocation) => unknown;
  readonly headPolicy: object;
  readonly config: object;
  readonly recipes?: unknown;
  readonly analyzeFixes?: unknown;
};

export function javaFixOptions({
  root,
  executeFixCommand,
  headPolicy,
  config,
  recipes,
  analyzeFixes,
}: JavaFixRun): FixOptions {
  return {
    repositoryRoot: root,
    projectRoot: root,
    baseRef: 'base',
    executeFixCommand,
    spawnEnvironment: undefined,
    scope: undefined,
    dryRun: false,
    selectedRules: undefined,
    allFiles: false,
    verifyMode: 'narrow',
    environment: ENVIRONMENT,
    headPolicy,
    config,
    recipes,
    analyzeFixes,
  };
}
