import { insideProject } from '../../../../libraries/project-files.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../../../core/tooling/temporary-files.mjs';
import { execute } from '../../python-process.mjs';
import { environmentError } from '../environment-error.mjs';
import { declaredManagedEnvironment } from '../managed.mjs';
import { INSTALL_HINTS, missingToolError } from '../install-hints.mjs';
import { dependenciesDiffer, dependencyFiles } from './dependency-files.mjs';
import {
  environmentBin,
  lockStep,
  lockTool,
  pipSteps,
  requirementsNames,
  venvStep,
  VENV_DIRECTORY,
} from './installers.mjs';
import { safeRequirements } from './requirements.mjs';

const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;
const MESSAGE_TAIL = 1500;
const DIRECT_LAUNCHER = { launch: (tool, args) => ({ command: tool, args, env: {} }) };
const SELF_MANAGED_SETTINGS = ['path', 'hatch', 'conda'];

function lockedPlan(projectRoot, files, setting) {
  const tool = lockTool(files, setting);
  if (tool === undefined || !files.includes(tool.lock)) {
    return undefined;
  }
  if (tool.forbids?.test(readFileSync(insideProject(projectRoot, tool.lock), 'utf8'))) {
    throw environmentError(
      `${tool.lock} of the base installs local packages, whose setup code the base environment must not run: install them in an environment of your own and set "python.environment" to it`,
    );
  }
  return { label: tool.kind, steps: (directory) => [lockStep(tool, directory)] };
}

function requirementsPlan(projectRoot, files, setting) {
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

function installPlan(projectRoot, setting) {
  if (SELF_MANAGED_SETTINGS.includes(setting)) {
    return undefined;
  }
  const files = dependencyFiles(projectRoot);
  return lockedPlan(projectRoot, files, setting) ?? requirementsPlan(projectRoot, files, setting);
}

function failure(step, result, projectRoot) {
  if (result.error?.code === 'ENOENT') {
    return missingToolError(
      step.kind,
      'the base snapshot has other dependencies than the head, so it needs an environment of its own',
    );
  }
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().slice(-MESSAGE_TAIL);
  return environmentError(
    `${step.command.join(' ')} failed for the base snapshot ${projectRoot} (${result.error?.message ?? `exit ${String(result.status)}`}): ${output || 'no output'}. The base needs its own environment because its dependency files differ from the head's (${INSTALL_HINTS[step.kind]})`,
  );
}

function runStep(step, projectRoot) {
  const result = execute({ launcher: DIRECT_LAUNCHER, projectRoot, env: {} }, step.command, {
    timeout: INSTALL_TIMEOUT_MS,
    env: step.variables,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw failure(step, result, projectRoot);
  }
}

function plannedSteps(plan, directory) {
  const planned = plan.steps(directory);
  return Array.isArray(planned) ? { steps: planned, cleanup: () => {} } : planned;
}

export function baseEnvironment({ projectRoot, liveRoot, setting, virtualenv }) {
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
