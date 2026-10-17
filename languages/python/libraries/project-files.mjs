import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export function toml() {
  return createRequire(import.meta.url)('smol-toml');
}

export function isDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory();
}

/** The absolute path of a project-relative file, refusing one that leaves the project. */
export function insideProject(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (full === root) {
    return root;
  }
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${file} is outside the project at ${projectRoot}`);
  }
  return full;
}

/** The text of a project-relative file, or undefined when it does not exist. */
export function readProjectFile(projectRoot, file) {
  const full = insideProject(projectRoot, file);
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}
