import { existsSync } from 'node:fs';
import { pathInside } from '../../../shared/filesystem.mjs';

export function insideProject(root, relative) {
  const file = pathInside(root, relative);
  if (file === undefined) {
    throw new Error(`${relative} is outside ${root}`);
  }
  return file;
}

export function hasProjectFile(root, ...names) {
  return names.some((name) => existsSync(insideProject(root, name)));
}
