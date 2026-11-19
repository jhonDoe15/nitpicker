import path from 'node:path';
import { isInsideRoot, relativeToRoot, underRoot } from '../layout/source-root/root-paths.mjs';
export const FEATURES_FOLDER = 'main/features';
export const SHARED_FOLDER = 'main/shared';

export function typescriptFeatureLayout(layout, sourceRoots) {
  return {
    sharedRoots:
      layout?.sharedRoots ?? sourceRoots.map((root) => path.posix.join('**', root, SHARED_FOLDER)),
    featureRoots:
      layout?.featureRoots ??
      sourceRoots.map((root) => path.posix.join('**', root, FEATURES_FOLDER)),
    sharedInsideFeatures: layout?.sharedRoots !== undefined,
  };
}

const MAIN_FOLDER = 'main';
const COMPOSITION_ROOT_FOLDER = /^composition-root\//u;
const COMPOSITION_ROOT_FILE = /^composition-root\.[cm]?[jt]sx?$/u;

function sharedFolderOf(file, sharedRoots) {
  const parts = file.split('/');
  return parts
    .slice(1)
    .map((_, index) => parts.slice(0, index + 1).join('/'))
    .find((folder) => sharedRoots.some((root) => root.test(folder)));
}

function placeUnder(root, file) {
  const inside = relativeToRoot(file, root);
  if (COMPOSITION_ROOT_FOLDER.test(inside)) {
    return { group: underRoot(root, 'composition-root'), wiring: true };
  }
  if (COMPOSITION_ROOT_FILE.test(inside) || !inside.includes('/')) {
    return { group: file, wiring: true };
  }
  return { group: underRoot(root, inside.split('/')[0]), wiring: false };
}

function featureGroup(file, directory) {
  const inside = file.slice(directory.length + 1);
  return inside.includes('/') ? `${directory}/${inside.split('/')[0]}` : directory;
}

export function stabilityUnits({ sourceRoot, sharedRoots, roleOf }) {
  const main = underRoot(sourceRoot, MAIN_FOLDER);
  function placeOf(file) {
    const role = roleOf(file);
    if (role.kind === 'feature') {
      return { group: featureGroup(file, role.directory), wiring: false };
    }
    const shared = sharedFolderOf(file, sharedRoots);
    if (shared !== undefined) {
      return { group: shared, wiring: false };
    }
    const root = [main, sourceRoot].find((folder) => isInsideRoot(file, folder));
    return root === undefined
      ? { group: file.slice(0, file.lastIndexOf('/')), wiring: false }
      : placeUnder(root, file);
  }
  return {
    groupOf: (file) => placeOf(file).group,
    roleOf: (file) => (placeOf(file).wiring ? { kind: 'wiring' } : roleOf(file)),
    groupNoun: 'folder',
  };
}
