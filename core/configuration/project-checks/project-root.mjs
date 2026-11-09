import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';
import { chainOf } from '../../../shared/traversal.mjs';
import { detectedPreset } from './preset-detection.mjs';
import { markerFilesIn } from './project-markers.mjs';

const PROJECT_MARKERS = ['package.json', CONFIG_FILE_NAME];

export function resolveProjectRoot(cwd = process.cwd()) {
  const current = realpathSync(cwd);
  const repositoryRoot = realpathSync(
    execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: current,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    }).trim(),
  );
  const directories = chainOf(current, (directory) => {
    const parent = path.dirname(directory);
    return directory === repositoryRoot || directory === parent ? undefined : parent;
  });
  const projectRoot = directories.find(
    (directory) => markerFilesIn(directory, PROJECT_MARKERS).length > 0,
  );
  if (projectRoot !== undefined) {
    return projectRoot;
  }
  throw new Error(noProjectMessage(current, repositoryRoot));
}

function noProjectMessage(current, repositoryRoot) {
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
