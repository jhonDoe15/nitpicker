import path from 'node:path';
import {
  lstatIfExists,
  removeOwnedLink,
  linkPolicyFile,
} from '../../../../core/tooling/policy-links.mjs';
import { realpathSync, symlinkSync } from 'node:fs';
import { readLayout } from '../../preset/head-policy.mjs';
import { validatedContainedFile } from './paths.mjs';
import { layoutTransformFor } from '../../preset/tool-configs.mjs';

export function linkDependencies({ dependencyRoot, roots }) {
  const linkedDependencies = [];
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

function assertReplaceableDependencies(existingEntry, linkPath, dependencyRoot) {
  const isPreparedDirectory = existingEntry.isDirectory() && !existingEntry.isSymbolicLink();
  const isExpectedLink =
    existingEntry.isSymbolicLink() && realpathSync(linkPath) === dependencyRoot;
  if (!isPreparedDirectory && !isExpectedLink) {
    throw new Error(`Refusing to replace existing dependencies at ${linkPath}`);
  }
}

export function removeDependencyLinks(linkedDependencies) {
  for (const linkedDependency of linkedDependencies.reverse()) {
    removeOwnedLink(linkedDependency.linkPath, linkedDependency.dependencyRoot, 'dependency');
  }
}

export function installPolicyFiles({ policyFiles, policyRoot, projectRoot }) {
  const installedFiles = [];
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

export function restorePolicyFiles(installedFiles) {
  for (const installedFile of installedFiles.reverse()) {
    installedFile.remove();
  }
}
