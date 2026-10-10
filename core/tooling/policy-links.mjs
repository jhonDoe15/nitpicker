import {
  lstatSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { trackTemporaryPath, untrackTemporaryPath } from './temporary-files.mjs';

export function linkPolicyFile(sourcePath, targetPath, transform) {
  const canonicalSource = realpathSync(sourcePath);
  if (lstatIfExists(targetPath) !== undefined) {
    throw new Error(`Temporary policy target already exists: ${targetPath}`);
  }
  trackTemporaryPath(targetPath);
  if (transform !== undefined) {
    writeFileSync(targetPath, transform(readFileSync(canonicalSource, 'utf8'), targetPath), {
      flag: 'wx',
    });
    return {
      sourcePath: canonicalSource,
      targetPath,
      remove() {
        unlinkSync(targetPath);
        untrackTemporaryPath(targetPath);
      },
    };
  }
  symlinkSync(canonicalSource, targetPath, 'file');
  return {
    sourcePath: canonicalSource,
    targetPath,
    remove() {
      removeOwnedLink(targetPath, canonicalSource, 'policy');
      untrackTemporaryPath(targetPath);
    },
  };
}

export function removeOwnedLink(linkPath, expectedTarget, kind) {
  const entry = lstatIfExists(linkPath);
  if (entry === undefined || !entry.isSymbolicLink() || realpathSync(linkPath) !== expectedTarget) {
    throw new Error(`Refusing to remove replaced ${kind} link: ${linkPath}`);
  }
  unlinkSync(linkPath);
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
