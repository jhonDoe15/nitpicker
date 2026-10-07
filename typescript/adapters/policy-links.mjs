import { lstatSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';

export function linkPolicyFile(sourcePath, targetPath) {
  const canonicalSource = realpathSync(sourcePath);
  if (lstatIfExists(targetPath) !== undefined) {
    throw new Error(`Temporary policy target already exists: ${targetPath}`);
  }
  symlinkSync(canonicalSource, targetPath, 'file'); // nosemgrep: javascript.express.file.fs-express.fs-express
  return {
    sourcePath: canonicalSource,
    targetPath,
    remove() {
      removeOwnedLink(targetPath, canonicalSource, 'policy');
    },
  };
}

export function removeOwnedLink(linkPath, expectedTarget, kind) {
  const entry = lstatIfExists(linkPath);
  if (entry === undefined || !entry.isSymbolicLink() || realpathSync(linkPath) !== expectedTarget) {
    throw new Error(`Refusing to remove replaced ${kind} link: ${linkPath}`);
  }
  unlinkSync(linkPath); // nosemgrep: javascript.express.file.fs-express.fs-express
}

export function lstatIfExists(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
