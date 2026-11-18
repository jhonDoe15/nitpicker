import { insideProject } from '../../../../libraries/project-files.mts';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath as untypedTrack,
  untrackTemporaryPath,
} from '../../../../../../core/tooling/temporary-files.mjs';
import { execute } from '../../python-process.mts';
import { environmentError } from '../environment-error.mts';
import { declaredManagedEnvironment } from '../managed.mts';
import { INSTALL_HINTS, missingToolError } from '../install-hints.mts';
import { dependenciesDiffer, dependencyFiles } from './dependency-files.mts';
import {
  environmentBin,
  lockStep,
  lockTool,
  pipSteps,
  requirementsNames,
  venvStep,
  VENV_DIRECTORY,
} from './installers.mts';
import { safeRequirements } from './requirements.mts';
import type { Launcher } from '../../../typed/environment/launcher-types.mts';
import type { SpawnResult } from '../../typed/process-types.mts';
import type {
  BaseOptions,
  InstallPlan,
  InstallStep,
  PlannedSteps,
} from '../typed/environment-types.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../../../shared/messages/troubleshooting.mjs';

const trackTemporaryPath: (target: string) => string = untypedTrack;
const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;
const MESSAGE_TAIL = 1500;
const DIRECT_LAUNCHER: Launcher = {
  description: 'direct',
  launch: (tool, args) => ({ command: tool, args, env: {} }),
};
const SELF_MANAGED_SETTINGS = ['path', 'hatch', 'conda'];

function lockedPlan(
  projectRoot: string,
  files: readonly string[],
  setting: string | undefined,
): InstallPlan | undefined {
  const tool = lockTool(files, setting);
  if (tool === undefined || !files.includes(tool.lock)) {
    return undefined;
  }
  if (tool.forbids?.test(readFileSync(insideProject(projectRoot, tool.lock), 'utf8'))) {
    throw environmentError(
      `${tool.lock} of the base installs local packages, whose setup code the base environment must not run: install them in an environment of your own and set "python.environment" to it`,
      TROUBLESHOOTING_ANCHORS.pythonBaseEnvironment,
    );
  }
  return { label: tool.kind, steps: (directory) => [lockStep(tool, directory)] };
}

function requirementsPlan(
  projectRoot: string,
  files: readonly string[],
  setting: string | undefined,
): InstallPlan | undefined {
  const names = requirementsNames(files);
  if (
    setting !== undefined ||
    names.length === 0 ||
    declaredManagedEnvironment(projectRoot) !== undefined
  ) {
    return undefined;
  }
  return {
    label: 'pip',
    steps: () => {
      const { lines, constraints } = safeRequirements(projectRoot, names);
      const scratch = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-')));
      const requirementsFile = path.join(scratch, 'requirements.txt');
      writeFileSync(requirementsFile, `${lines.join('\n')}\n`);
      return {
        steps: pipSteps({ projectRoot, requirementsFile, constraints }),
        cleanup: () => {
          rmSync(scratch, { recursive: true, force: true });
          untrackTemporaryPath(scratch);
        },
      };
    },
  };
}

function installPlan(projectRoot: string, setting: string | undefined): InstallPlan | undefined {
  if (setting !== undefined && SELF_MANAGED_SETTINGS.includes(setting)) {
    return undefined;
  }
  const files = dependencyFiles(projectRoot);
  return lockedPlan(projectRoot, files, setting) ?? requirementsPlan(projectRoot, files, setting);
}

function failure(step: InstallStep, result: SpawnResult, projectRoot: string): Error {
  if (result.error?.code === 'ENOENT') {
    return missingToolError(
      step.kind,
      'the base snapshot has other dependencies than the head, so it needs an environment of its own',
      TROUBLESHOOTING_ANCHORS.pythonBaseEnvironment,
    );
  }
  const output = `${result.stderr}${result.stdout}`.trim().slice(-MESSAGE_TAIL);
  return environmentError(
    `${step.command.join(' ')} failed for the base snapshot ${projectRoot} (${result.error?.message ?? `exit ${String(result.status)}`}): ${output || 'no output'}. The base needs its own environment because its dependency files differ from the head's (${INSTALL_HINTS[step.kind]})`,
    TROUBLESHOOTING_ANCHORS.pythonBaseEnvironment,
  );
}

function runStep(step: InstallStep, projectRoot: string): void {
  const result = execute({ launcher: DIRECT_LAUNCHER, projectRoot, env: {} }, step.command, {
    timeout: INSTALL_TIMEOUT_MS,
    env: step.variables,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw failure(step, result, projectRoot);
  }
}

function plannedSteps(plan: InstallPlan, directory: string): PlannedSteps {
  const planned = plan.steps(directory);
  return Array.isArray(planned) ? { steps: planned, cleanup: () => {} } : planned;
}

export function baseEnvironment({
  projectRoot,
  liveRoot,
  setting,
  virtualenv,
}: BaseOptions): Launcher | undefined {
  if (projectRoot === liveRoot || !dependenciesDiffer(projectRoot, liveRoot)) {
    return undefined;
  }
  const plan = installPlan(projectRoot, setting);
  if (plan === undefined) {
    return undefined;
  }
  const directory = path.join(projectRoot, VENV_DIRECTORY);
  const { steps, cleanup } = plannedSteps(plan, directory);
  try {
    for (const step of steps) {
      runStep(step, projectRoot);
    }
    if (!existsSync(environmentBin(directory))) {
      runStep(venvStep(directory), projectRoot);
    }
  } finally {
    cleanup();
  }
  return virtualenv(directory, plan.label);
}
