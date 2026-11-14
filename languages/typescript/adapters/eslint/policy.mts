import path from 'node:path';
import type { Stats } from 'node:fs';
import { lstatIfExists, removeOwnedLink } from '../../../../core/tooling/policy-links.mjs';
import { type LinkedPolicyFile, linkPolicyFile } from '../typed/tooling.mts';
import { realpathSync, symlinkSync } from 'node:fs';
import { layoutTransformFor, readLayout } from '../typed/head-policy.mts';
import { validatedContainedFile } from './paths.mts';

export type DependencyLink = { readonly linkPath: string; readonly dependencyRoot: string };

type PolicyInstall = {
  readonly policyFiles: readonly string[];
  readonly policyRoot: string;
  readonly projectRoot: string;
};

export function linkDependencies({
  dependencyRoot,
  roots,
}: {
  readonly dependencyRoot: string;
  readonly roots: readonly string[];
}): DependencyLink[] {
  const linkedDependencies: DependencyLink[] = [];
  try {
    for (const root of new Set(roots)) {
      const linkPath = path.join(root, 'node_modules');
      const existingEntry = lstatIfExists(linkPath);
      if (existingEntry === undefined) {
        symlinkSync(dependencyRoot, linkPath, 'dir');
        linkedDependencies.push({ linkPath, dependencyRoot });
      } else {
        assertReplaceableDependencies(existingEntry, linkPath, dependencyRoot);
      }
    }
    return linkedDependencies;
  } catch (error) {
    removeDependencyLinks(linkedDependencies);
    throw error;
  }
}

function assertReplaceableDependencies(
  existingEntry: Stats,
  linkPath: string,
  dependencyRoot: string,
): void {
  const isPreparedDirectory = existingEntry.isDirectory() && !existingEntry.isSymbolicLink();
  const isExpectedLink =
    existingEntry.isSymbolicLink() && realpathSync(linkPath) === dependencyRoot;
  if (!isPreparedDirectory && !isExpectedLink) {
    throw new Error(`Refusing to replace existing dependencies at ${linkPath}`);
  }
}

export function removeDependencyLinks(linkedDependencies: readonly DependencyLink[]): void {
  for (const linkedDependency of linkedDependencies.toReversed()) {
    removeOwnedLink(linkedDependency.linkPath, linkedDependency.dependencyRoot, 'dependency');
  }
}

export function installPolicyFiles({
  policyFiles,
  policyRoot,
  projectRoot,
}: PolicyInstall): LinkedPolicyFile[] {
  const installedFiles: LinkedPolicyFile[] = [];
  const layout = readLayout();
  try {
    for (const [index, relativePath] of policyFiles.entries()) {
      const sourcePath = validatedContainedFile(
        policyRoot,
        relativePath,
        '--policy-file',
      ).canonicalPath;
      const extension = path.extname(relativePath);
      installedFiles.push(
        linkPolicyFile(
          sourcePath,
          path.join(projectRoot, `.nitpicker-diff-policy-${String(index)}${extension}`),
          layoutTransformFor(relativePath, layout),
        ),
      );
    }
    return installedFiles;
  } catch (error) {
    restorePolicyFiles(installedFiles);
    throw error;
  }
}

export function restorePolicyFiles(installedFiles: readonly LinkedPolicyFile[]): void {
  for (const installedFile of installedFiles.toReversed()) {
    installedFile.remove();
  }
}
