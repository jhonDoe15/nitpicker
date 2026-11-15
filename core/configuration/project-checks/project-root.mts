import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../shared/messages/troubleshooting.mjs';
import { chainOf as untypedChainOf } from '../../../shared/traversal.mjs';
import { detectedPreset, markerFilesIn } from './project-check-views.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

const chainOf: (start: string, next: (current: string) => string | undefined) => string[] =
  untypedChainOf;

const PROJECT_MARKERS = ['package.json', CONFIG_FILE_NAME];

export function resolveProjectRoot(cwd: string = process.cwd()): string {
  const current = realpathSync(cwd);
  const repositoryRoot = repositoryRootOf(current);
  const directories = chainOf(current, (directory: string) => {
    const parent = path.dirname(directory);
    return directory === repositoryRoot || directory === parent ? undefined : parent;
  });
  const projectRoot = directories.find(
    (directory: string) => markerFilesIn(directory, PROJECT_MARKERS).length > 0,
  );
  if (projectRoot !== undefined) {
    return projectRoot;
  }
  throw troubleshootingError(
    noProjectMessage(current, repositoryRoot),
    TROUBLESHOOTING_ANCHORS.noProjectFound,
  );
}

function repositoryRootOf(directory: string): string {
  try {
    return realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: GIT_TIMEOUT_MS,
      }).trim(),
    );
  } catch (error) {
    const gitOutput = textOf(fieldOf(error, 'stderr')).trim();
    const gitSaid = gitOutput === '' ? '' : `\ngit said:\n${gitOutput}`;
    throw troubleshootingError(
      `${directory} is not inside a Git repository that git can read (or git is not installed). ` +
        `nitpicker compares your changes with their merge base, so run it inside a Git checkout.${gitSaid}`,
      TROUBLESHOOTING_ANCHORS.notAGitRepository,
      { cause: error },
    );
  }
}

function noProjectMessage(current: string, repositoryRoot: string): string {
  const where =
    current === repositoryRoot
      ? `in the repository root ${current}`
      : `between ${current} and repository root ${repositoryRoot}`;
  const detected = detectedPreset(current);
  const advice =
    detected === undefined
      ? `For a Java, Kotlin, Python or Go project, create ${CONFIG_FILE_NAME} with its preset, for example {"preset": "java"}.`
      : `The current folder has ${detected.file}: create ${CONFIG_FILE_NAME} with {"preset": "${detected.preset}"} (or run nitpicker init).`;
  return `No package.json or ${CONFIG_FILE_NAME} found ${where}. ${advice}`;
}
