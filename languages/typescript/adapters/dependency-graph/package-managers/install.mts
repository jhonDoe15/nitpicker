import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';
import { containedPath } from './contained-path.mts';
import { installInvocation, isBerry } from './commands.mts';
import type { ManagerAtRoot } from './commands.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../../shared/messages/troubleshooting.mjs';
import {
  explainedError,
  troubleshootingError,
  withTroubleshooting,
} from '../typed/outside-views.mts';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const INSTALL_TIMEOUT_MINUTES = 4;
const MINUTE_MS = 60 * 1000;
const COMMAND_NOT_FOUND_STATUS = 127;
const PLUGINS_KEY = /^plugins\s*:/mu;
const FAILURE_PREFIX = 'Failed to install merge-base dependencies';

const SPAWN_FAILURES: Record<string, string> = {
  ETIMEDOUT: `timed out after ${String(INSTALL_TIMEOUT_MINUTES)} minutes`,
  ENOBUFS: 'printed more output than nitpicker keeps',
};

function assertSupportedPlatform(platform: string): void {
  if (platform === 'win32') {
    throw troubleshootingError(
      `${FAILURE_PREFIX}: installing the base dependencies is not supported on native Windows (Node refuses to start the package managers' .cmd shims without a shell). Run nitpicker in WSL.`,
      TROUBLESHOOTING_ANCHORS.windowsAndWsl,
    );
  }
}

function assertNoRepositoryPlugins(packageManager: ManagerAtRoot): void {
  const rcFile = containedPath(packageManager.root, '.yarnrc.yml');
  if (
    isBerry(packageManager) &&
    existsSync(rcFile) &&
    PLUGINS_KEY.test(readFileSync(rcFile, 'utf8'))
  ) {
    throw troubleshootingError(
      `${FAILURE_PREFIX}: the base's .yarnrc.yml lists Yarn plugins, which are JavaScript files that Yarn runs during an install, and nitpicker does not run repository code there. Remove the plugins from the base, or make its package.json and lockfile equal to the head's so that no install is needed.`,
      TROUBLESHOOTING_ANCHORS.unsupportedYarn,
    );
  }
}

function failureDetail(result: SpawnSyncReturns<string>): string {
  const spawnFailure = SPAWN_FAILURES[textOf(fieldOf(result.error, 'code'))];
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

export function installDependencies(
  packageManager: ManagerAtRoot,
  platform = process.platform,
): { ok: boolean; detail: string } {
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
    throw explainedError(
      `${FAILURE_PREFIX}: this project uses ${packageManager.name}, which is not installed. ${installHint}`,
    );
  }
  return { ok: result.error === undefined && result.status === 0, detail: failureDetail(result) };
}

const NPM_10_PEER_CRASH = "reading 'edgesOut'";
const NPM_10_HINT =
  'npm 10 cannot resolve the optional peer dependencies of Vitest 4. Update npm with `npm install --global npm@11` and run nitpicker again.';

function missingLocalPackagesHint(missing: string[]): string {
  return `The base depends on local packages that nitpicker did not find for it: ${missing.join(', ')}.`;
}

export function failureMessage(
  packageManager: ManagerAtRoot,
  detail: string,
  {
    missingLocalPackages = [],
    anchor = TROUBLESHOOTING_ANCHORS.baseInstallFails,
  }: { missingLocalPackages?: string[]; anchor?: string } = {},
): string {
  const hints = [
    ...(detail.includes(NPM_10_PEER_CRASH) ? [NPM_10_HINT] : []),
    ...(missingLocalPackages.length > 0 ? [missingLocalPackagesHint(missingLocalPackages)] : []),
  ];
  return withTroubleshooting(
    [`${FAILURE_PREFIX} with ${packageManager.name}: ${detail}`, ...hints].join('\n'),
    anchor,
  );
}

export function missingDependenciesMessage(
  packageManager: ManagerAtRoot,
  dependencyPath: string,
): string {
  if (isBerry(packageManager)) {
    return withTroubleshooting(
      `Dependencies are not installed: ${dependencyPath} is missing. Yarn Plug'n'Play is not supported: set \`nodeLinker: node-modules\` in .yarnrc.yml and run \`yarn install\` in ${packageManager.root}.`,
      TROUBLESHOOTING_ANCHORS.unsupportedYarn,
    );
  }
  return `Dependencies are not installed: ${dependencyPath} is missing. Run \`${packageManager.name} install\` in ${packageManager.root} first.`;
}

export function ensureDependencyFolder(
  packageManager: ManagerAtRoot,
  dependencyPath: string,
): void {
  if (existsSync(dependencyPath)) {
    return;
  }
  if (isBerry(packageManager)) {
    throw new Error(
      failureMessage(
        packageManager,
        "the install created no node_modules folder (Yarn Plug'n'Play is not supported: set `nodeLinker: node-modules`)",
        { anchor: TROUBLESHOOTING_ANCHORS.unsupportedYarn },
      ),
    );
  }
  mkdirSync(dependencyPath);
}
