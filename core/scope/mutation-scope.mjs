import { execFileSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';
import { isInScope } from './scope-findings.mjs';

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

export function byCodeUnits(left, right) {
  return Number(left > right) - Number(left < right);
}

export function isInMutationScope(file, mutationScope) {
  return mutationScope === undefined || isInScope(file, { paths: mutationScope });
}

export function listedProjectFiles(projectRoot, pathspecs) {
  const args = ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...pathspecs];
  const listed = execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    timeout: GIT_TIMEOUT_MS,
  });
  return [...new Set(listed.split('\0').filter((file) => file.length > 0))].toSorted(byCodeUnits);
}

export function scopedProjectFiles(projectRoot, mutationScope) {
  return listedProjectFiles(
    projectRoot,
    mutationScope.map((entry) => `:(literal)${entry}`),
  );
}

function holdsScope(directory, mutationScope) {
  return mutationScope.some((entry) => entry === directory || entry.startsWith(`${directory}/`));
}

function fnmatchLiteral(text) {
  return text.replaceAll(/[*?[]/gu, (character) => `[${character}]`);
}

function outsidePattern(file, mutationScope) {
  const folders = file.split('/').slice(0, -1);
  const outside = [...folders.keys()]
    .map((index) => folders.slice(0, index + 1).join('/'))
    .find((directory) => !holdsScope(directory, mutationScope));
  return outside === undefined ? fnmatchLiteral(file) : `${fnmatchLiteral(outside)}/*`;
}

export function outsideScopePatterns(files, mutationScope) {
  return [
    ...new Set(
      files
        .filter((file) => !isInMutationScope(file, mutationScope))
        .map((file) => outsidePattern(file, mutationScope)),
    ),
  ].toSorted(byCodeUnits);
}
