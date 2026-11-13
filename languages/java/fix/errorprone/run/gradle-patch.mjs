import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runFixCommand } from '../../../../../core/fix/common/fix-command.mjs';
import { gradleTarget } from '../../../adapters/gradle-wrapper/gradle-command.mjs';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';

const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache'];

export function patchFlags({ checks, patchRoot }) {
  return [`-XepPatchChecks:${checks.join(',')}`, `-XepPatchLocation:${patchRoot}`];
}

export function gradleArguments({ settingsFile, reportRoot, initScript = INIT_SCRIPT }) {
  return [
    ...GRADLE_FLAGS,
    `-Pnitpicker.reportDir=${reportRoot}`,
    `-Pnitpicker.errorprone.settings=${settingsFile}`,
    '-I',
    initScript,
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
}) {
  const patchRoot = path.join(work, 'patches');
  const reportRoot = path.join(work, 'reports');
  mkdirSync(patchRoot, { recursive: true });
  mkdirSync(reportRoot, { recursive: true });
  const settingsFile = path.join(work, 'errorprone-settings.json');
  writeFileSync(settingsFile, JSON.stringify([...flags, ...patchFlags({ checks, patchRoot })]));
  const target = gradleTarget({
    projectRoot,
    configured: environment.NITPICKER_GRADLE || undefined,
    args: gradleArguments({ settingsFile, reportRoot }),
  });
  runFixCommand({
    operation: 'error-prone-patch',
    command: target.command,
    args: target.args,
    cwd: projectRoot,
    acceptedStatuses: [0],
    shell: target.shell,
    executeFixCommand,
  });
  return { patchRoot, reportRoot };
}
