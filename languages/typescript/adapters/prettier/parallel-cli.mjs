import { spawnSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';

const EXCLUSION_FILE_NAME = '.nitpicker-diff-prettier-exclude';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const UNTRANSLATABLE_CHARACTERS = /[\s\\{}()[\]!]/u;
const WILDCARD = /[*?]/u;

export function listUnformattedInParallel({
  toolPath,
  projectRoot,
  configPath,
  ignorePath,
  patterns,
  exclusions,
}) {
  const exclusionLines = exclusionIgnoreLines(exclusions);
  if (exclusionLines === undefined) {
    return undefined;
  }
  const exclusionPath = writeExclusionFile(projectRoot, exclusionLines);
  try {
    const result = spawnSync(
      process.execPath,
      [
        toolPath,
        '--experimental-cli',
        '--no-cache',
        '--no-color',
        '--config-path',
        configPath,
        '--ignore-path',
        ignorePath,
        ...(exclusionPath === undefined ? [] : ['--ignore-path', exclusionPath]),
        '--no-editorconfig',
        '--list-different',
        '--no-error-on-unmatched-pattern',
        ...patterns,
      ],
      { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
    );
    return unformattedFilesOf(result);
  } finally {
    removeExclusionFile(exclusionPath);
  }
}

export function exclusionIgnoreLines(exclusions) {
  return exclusions.every(isTranslatableExclusion)
    ? exclusions.map((glob) => `/${glob}`)
    : undefined;
}

function isTranslatableExclusion(glob) {
  const segments = glob.split('/');
  if (
    glob.length === 0 ||
    UNTRANSLATABLE_CHARACTERS.test(glob) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return false;
  }
  return segments.at(-1) === '**' || !WILDCARD.test(segments.at(-1));
}

function unformattedFilesOf(result) {
  if (result.error !== undefined || result.stderr.trim().length > 0) {
    return undefined;
  }
  const files = result.stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (result.status === 0 && files.length === 0) {
    return [];
  }
  return result.status === 1 && files.length > 0 ? files : undefined;
}

function writeExclusionFile(projectRoot, exclusionLines) {
  if (exclusionLines.length === 0) {
    return undefined;
  }
  const exclusionPath = path.join(projectRoot, EXCLUSION_FILE_NAME);
  writeFileSync(exclusionPath, `${exclusionLines.join('\n')}\n`, { flag: 'wx' });
  return trackTemporaryPath(exclusionPath);
}

function removeExclusionFile(exclusionPath) {
  if (exclusionPath === undefined) {
    return;
  }
  unlinkSync(exclusionPath);
  untrackTemporaryPath(exclusionPath);
}
