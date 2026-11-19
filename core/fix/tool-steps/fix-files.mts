import { isUtf8 } from 'node:buffer';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { globsMatcher } from '../../../shared/paths/glob.mjs';
import { collectWorkingTreeChanges } from '../changes.mts';
import { isInScope } from '../../scope/scope-findings.mts';
import { collectProjectFiles } from '../all-files/project-files.mts';
import { textOf } from '../../../shared/values/readers.mts';
import { scopeOf } from '../typed/error-text.mts';
import { containedPath } from './paths/contained-path.mts';
import type { Bytes, CollectedFiles } from '../typed/command-types.mts';
import type { FixFile } from '../typed/fix-types.mts';

export { globsMatcher as excludedBy };

export function collectFixFiles({
  repositoryRoot,
  projectRoot,
  baseRef,
  accepts,
  scope,
  allFiles,
}: {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly accepts: (name: string) => boolean;
  readonly scope: unknown;
  readonly allFiles: boolean;
}): CollectedFiles {
  if (allFiles) {
    return collectProjectFiles({ projectRoot, accepts, scope: scopeOf(scope) });
  }
  const { comparison, changes } = collectWorkingTreeChanges({
    repositoryRoot,
    projectRoot,
    baseRef: textOf(baseRef),
  });
  function wanted(name: string): boolean {
    return accepts(name) && isInScope(name, scopeOf(scope));
  }
  return {
    comparison,
    files: changes.filter(({ isFile, path: name }) => isFile && wanted(name)),
    links: changes
      .filter(({ isFile, path: name }) => !isFile && isLink(projectRoot, name) && wanted(name))
      .map(({ path: name }) => name),
  };
}

function isLink(projectRoot: string, name: string): boolean {
  const stats = lstatSync(containedPath(projectRoot, name), { throwIfNoEntry: false });
  return stats?.isSymbolicLink() === true;
}

export function readBytes(projectRoot: string, files: readonly FixFile[]): Bytes {
  return new Map(
    files.map(({ path: name }): [string, Buffer] => [
      name,
      readFileSync(containedPath(projectRoot, name)),
    ]),
  );
}

function isRewritten(projectRoot: string, name: string, before: Bytes): boolean {
  const file = containedPath(projectRoot, name);
  return existsSync(file) && before.get(name)?.equals(readFileSync(file)) === false;
}

export function rewrittenPaths(
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
): string[] {
  return files
    .filter(({ path: name }) => isRewritten(projectRoot, name, before))
    .map(({ path: name }) => name);
}

export function changedFiles<File extends FixFile>(
  projectRoot: string,
  files: readonly File[],
  before: Bytes,
): File[] {
  return files.filter(({ path: name }) => {
    const file = containedPath(projectRoot, name);
    return existsSync(file) && !before.get(name)?.equals(readFileSync(file));
  });
}

function isDecodable(bytes: Bytes, name: string): boolean {
  const content = bytes.get(name);
  return content !== undefined && isUtf8(content);
}

export function splitByEncoding<File extends FixFile>(
  projectRoot: string,
  files: readonly File[],
): { files: File[]; undecodable: string[] } {
  const bytes = readBytes(projectRoot, files);
  return {
    files: files.filter(({ path: name }) => isDecodable(bytes, name)),
    undecodable: files
      .filter(({ path: name }) => !isDecodable(bytes, name))
      .map(({ path: name }) => name),
  };
}
