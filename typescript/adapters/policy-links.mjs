import {
  lstatSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { trackTemporaryPath, untrackTemporaryPath } from './temporary-files.mjs';

/**
 * Makes a package-owned policy file visible inside the analyzed tree. Without `transform` the
 * target is a link to the file. With one (the config file changed the layout), the target is a
 * copy of the file's text rewritten by `transform`; the copy is still package-owned content
 * derived from the head policy, never from the analyzed tree.
 */
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
  symlinkSync(canonicalSource, targetPath, 'file'); // nosemgrep: javascript.express.file.fs-express.fs-express
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
