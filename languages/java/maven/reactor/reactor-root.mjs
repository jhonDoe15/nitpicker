import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parentChain } from '../../builds/change-scope/jvm-paths.mjs';

const MODULE_ENTRY = /<module>([^<]*)<\/module>/gu;
const COMMENT = /<!--[\s\S]*?-->/gu;
const PROFILES = /<profiles>[\s\S]*?<\/profiles>/gu;

function real(file) {
  return existsSync(file) ? realpathSync.native(file) : file;
}

function same(left, right) {
  return real(left) === real(right);
}

function listsModule(parent, child) {
  const pomFile = path.join(parent, 'pom.xml');
  if (!existsSync(pomFile)) {
    return false;
  }
  const text = readFileSync(pomFile, 'utf8').replace(COMMENT, '').replace(PROFILES, '');
  return [...text.matchAll(MODULE_ENTRY)].some(([, entry]) => {
    const target = path.resolve(parent, entry.trim());
    return same(target, child) || same(target, path.join(child, 'pom.xml'));
  });
}

export function reactorRootOf(projectRoot) {
  let top = projectRoot;
  for (const parent of parentChain(projectRoot).slice(1)) {
    if (existsSync(path.join(top, '.git')) || !listsModule(parent, top)) {
      break;
    }
    top = parent;
  }
  return top;
}

export function reactorRootFor(projectRoot, otherSnapshotRoot) {
  const top = reactorRootOf(projectRoot);
  return otherSnapshotRoot === undefined || reactorRootOf(otherSnapshotRoot) !== otherSnapshotRoot
    ? top
    : projectRoot;
}
