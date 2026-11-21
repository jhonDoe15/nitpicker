import { execFileSync } from 'node:child_process';
import { GIT_OUTPUT_LIMIT_BYTES, GIT_TIMEOUT_MS } from '../../shared/processes/deadlines.mts';
import { isInScope } from './scope-findings.mts';

export function byCodeUnits(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

export function mutationScopeOf(value: unknown): readonly string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
}

export function isInMutationScope(
  file: string,
  mutationScope: readonly string[] | undefined,
): boolean {
  return mutationScope === undefined || isInScope(file, { paths: mutationScope });
}

export function listedProjectFiles(projectRoot: string, pathspecs: readonly string[]): string[] {
  const args = ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...pathspecs];
  const listed = execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    timeout: GIT_TIMEOUT_MS,
  });
  return [...new Set(listed.split('\0').filter((file) => file.length > 0))].toSorted(byCodeUnits);
}

export function scopedProjectFiles(
  projectRoot: string,
  mutationScope: readonly string[],
): string[] {
  return listedProjectFiles(
    projectRoot,
    mutationScope.map((entry) => `:(literal)${entry}`),
  );
}

function holdsScope(directory: string, mutationScope: readonly string[]): boolean {
  return mutationScope.some((entry) => entry === directory || entry.startsWith(`${directory}/`));
}

function fnmatchLiteral(text: string): string {
  return text.replaceAll(/[*?[]/gu, (character: string) => `[${character}]`);
}

function outsidePattern(file: string, mutationScope: readonly string[]): string {
  const folders = file.split('/').slice(0, -1);
  const outside = [...folders.keys()]
    .map((index) => folders.slice(0, index + 1).join('/'))
    .find((directory) => !holdsScope(directory, mutationScope));
  return outside === undefined ? fnmatchLiteral(file) : `${fnmatchLiteral(outside)}/*`;
}

export function outsideScopePatterns(
  files: readonly string[],
  mutationScope: readonly string[],
): string[] {
  return [
    ...new Set(
      files
        .filter((file) => !isInMutationScope(file, mutationScope))
        .map((file) => outsidePattern(file, mutationScope)),
    ),
  ].toSorted(byCodeUnits);
}
