import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runFixCommand } from '../../../../../core/fix/common/fix-command.mjs';
import { gradleTarget } from '../../../adapters/gradle-wrapper/gradle-command.mjs';
import { INIT_SCRIPT as untypedInitScript } from '../../../builds/java-build.mjs';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { configuredTool } from '../../tools/tool-classpath.mts';
import { OWN_CHECKS_DIRECTORY, usesOwnChecks } from '../own/own-checks.mts';

export type PatchRun = {
  readonly projectRoot: string;
  readonly environment?: Environment | undefined;
  readonly executeFixCommand: unknown;
  readonly work: string;
  readonly flags: readonly string[];
  readonly checks: readonly string[];
};
export type PatchRoots = { readonly patchRoot: string; readonly reportRoot: string };

const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache'];
const INIT_SCRIPT: string = untypedInitScript;

export function patchFlags({
  checks,
  patchRoot,
}: {
  readonly checks: readonly string[];
  readonly patchRoot: string;
}): string[] {
  return [
    `-XepPatchChecks:${checks.join(',')}`,
    `-XepPatchLocation:${patchRoot}`,
    ...(usesOwnChecks(checks) ? [`-XepNitpickerFixChecks:${OWN_CHECKS_DIRECTORY}`] : []),
  ];
}

export function gradleArguments({
  settingsFile,
  reportRoot,
}: {
  readonly settingsFile: string;
  readonly reportRoot: string;
}): string[] {
  return [
    ...GRADLE_FLAGS,
    `-Pnitpicker.reportDir=${reportRoot}`,
    `-Pnitpicker.errorprone.settings=${settingsFile}`,
    '-I',
    INIT_SCRIPT,
    'nitpickerErrorProne',
  ];
}

export function runGradlePatch({
  projectRoot,
  environment = {},
  executeFixCommand,
  work,
  flags,
  checks,
}: PatchRun): PatchRoots {
  const patchRoot = path.join(work, 'patches');
  const reportRoot = path.join(work, 'reports');
  mkdirSync(patchRoot, { recursive: true });
  mkdirSync(reportRoot, { recursive: true });
  const settingsFile = path.join(work, 'errorprone-settings.json');
  writeFileSync(settingsFile, JSON.stringify([...flags, ...patchFlags({ checks, patchRoot })]));
  const target = callUntyped(gradleTarget, {
    projectRoot,
    configured: configuredTool(environment, 'NITPICKER_GRADLE'),
    args: gradleArguments({ settingsFile, reportRoot }),
    environment,
  });
  callUntyped(runFixCommand, {
    operation: 'error-prone-patch',
    command: fieldOf(target, 'command'),
    args: fieldOf(target, 'args'),
    cwd: projectRoot,
    acceptedStatuses: [0],
    shell: fieldOf(target, 'shell'),
    executeFixCommand,
  });
  return { patchRoot, reportRoot };
}
