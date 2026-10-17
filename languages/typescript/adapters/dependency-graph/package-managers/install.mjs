import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { containedPath } from './contained-path.mjs';
import { installInvocation, isBerry } from './commands.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const INSTALL_TIMEOUT_MINUTES = 4;
const MINUTE_MS = 60 * 1000;
const COMMAND_NOT_FOUND_STATUS = 127;
const PLUGINS_KEY = /^plugins\s*:/mu;
const FAILURE_PREFIX = 'Failed to install merge-base dependencies';

const SPAWN_FAILURES = {
  ETIMEDOUT: `timed out after ${INSTALL_TIMEOUT_MINUTES} minutes`,
  ENOBUFS: 'printed more output than nitpicker keeps',
};

function assertSupportedPlatform(platform) {
  if (platform === 'win32') {
    throw new Error(
      `${FAILURE_PREFIX}: installing the base dependencies is not supported on native Windows (Node refuses to start the package managers' .cmd shims without a shell). Run nitpicker in WSL.`,
    );
  }
}

function assertNoRepositoryPlugins(packageManager) {
  const rcFile = containedPath(packageManager.root, '.yarnrc.yml');
  if (
    isBerry(packageManager) &&
    existsSync(rcFile) &&
    PLUGINS_KEY.test(readFileSync(rcFile, 'utf8'))
  ) {
    throw new Error(
      `${FAILURE_PREFIX}: the base's .yarnrc.yml lists Yarn plugins, which are JavaScript files that Yarn runs during an install, and nitpicker does not run repository code there. Remove the plugins from the base, or make its package.json and lockfile equal to the head's so that no install is needed.`,
    );
  }
}

function failureDetail(result) {
  const spawnFailure = SPAWN_FAILURES[result.error?.code];
  if (spawnFailure !== undefined) {
    return spawnFailure;
  }
  if (result.error !== undefined) {
    return result.error.message;
  }
  const output = result.stderr.trim() || result.stdout.trim();
  if (output !== '') {
    return output;
  }
  return result.signal === null ? 'no diagnostic output' : `stopped by ${result.signal}`;
}

export function installDependencies(packageManager, platform = process.platform) {
  assertSupportedPlatform(platform);
  assertNoRepositoryPlugins(packageManager);
  const { command, args, installHint } = installInvocation(packageManager);
  const result = spawnSync(command, args, {
    cwd: packageManager.root,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: INSTALL_TIMEOUT_MINUTES * MINUTE_MS,
  });
  if (result.status === COMMAND_NOT_FOUND_STATUS) {
    throw new Error(
      `${FAILURE_PREFIX}: this project uses ${packageManager.name}, which is not installed. ${installHint}`,
    );
  }
  return { ok: result.error === undefined && result.status === 0, detail: failureDetail(result) };
}

export function failureMessage(packageManager, detail) {
  return `${FAILURE_PREFIX} with ${packageManager.name}: ${detail}`;
}

export function missingDependenciesMessage(packageManager, dependencyPath) {
  if (isBerry(packageManager)) {
    return `Dependencies are not installed: ${dependencyPath} is missing. Yarn Plug'n'Play is not supported: set \`nodeLinker: node-modules\` in .yarnrc.yml and run \`yarn install\` in ${packageManager.root}.`;
  }
  return `Dependencies are not installed: ${dependencyPath} is missing. Run \`${packageManager.name} install\` in ${packageManager.root} first.`;
}

export function ensureDependencyFolder(packageManager, dependencyPath) {
  if (existsSync(dependencyPath)) {
    return;
  }
  if (isBerry(packageManager)) {
    throw new Error(
      failureMessage(
        packageManager,
        "the install created no node_modules folder (Yarn Plug'n'Play is not supported: set `nodeLinker: node-modules`)",
      ),
    );
  }
  mkdirSync(dependencyPath);
}
