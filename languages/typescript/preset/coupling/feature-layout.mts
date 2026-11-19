import path from 'node:path';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { isInsideRoot, relativeToRoot, underRoot } from '../layout/source-root/root-paths.mts';
import type { FeatureLayoutInput, Matcher, RoleOf } from './typed/coupling-types.mts';

export const FEATURES_FOLDER = 'main/features';
export const SHARED_FOLDER = 'main/shared';

function configuredRoots(layout: unknown, key: string): string[] | undefined {
  const roots = fieldOf(layout, key);
  return roots === undefined ? undefined : textsOf(roots);
}

export function typescriptFeatureLayout(
  layout: unknown,
  sourceRoots: readonly string[],
): FeatureLayoutInput {
  const sharedRoots = configuredRoots(layout, 'sharedRoots');
  const featureRoots = configuredRoots(layout, 'featureRoots');
  return {
    sharedRoots:
      sharedRoots ?? sourceRoots.map((root) => path.posix.join('**', root, SHARED_FOLDER)),
    featureRoots:
      featureRoots ?? sourceRoots.map((root) => path.posix.join('**', root, FEATURES_FOLDER)),
    sharedInsideFeatures: sharedRoots !== undefined,
  };
}

type Place = { readonly group: string; readonly wiring: boolean };

const MAIN_FOLDER = 'main';
const COMPOSITION_ROOT_FOLDER = /^composition-root\//u;
const COMPOSITION_ROOT_FILE = /^composition-root\.[cm]?[jt]sx?$/u;

function sharedFolderOf(file: string, sharedRoots: readonly Matcher[]): string | undefined {
  const parts = file.split('/');
  return parts
    .slice(1)
    .map((_, index) => parts.slice(0, index + 1).join('/'))
    .find((folder) => sharedRoots.some((root) => root.test(folder)));
}

function placeUnder(root: string, file: string): Place {
  const inside = relativeToRoot(file, root);
  if (COMPOSITION_ROOT_FOLDER.test(inside)) {
    return { group: underRoot(root, 'composition-root'), wiring: true };
  }
  if (COMPOSITION_ROOT_FILE.test(inside) || !inside.includes('/')) {
    return { group: file, wiring: true };
  }
  return { group: underRoot(root, String(inside.split('/')[0])), wiring: false };
}

function featureGroup(file: string, directory: string): string {
  const inside = file.slice(directory.length + 1);
  return inside.includes('/') ? `${directory}/${String(inside.split('/')[0])}` : directory;
}

export function stabilityUnits({
  sourceRoot,
  sharedRoots,
  roleOf,
}: {
  readonly sourceRoot: string;
  readonly sharedRoots: readonly Matcher[];
  readonly roleOf: RoleOf;
}): { groupOf: (file: string) => string; roleOf: RoleOf; groupNoun: string } {
  const main = underRoot(sourceRoot, MAIN_FOLDER);
  function placeOf(file: string): Place {
    const role = roleOf(file);
    if (role.kind === 'feature' && role.directory !== undefined) {
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
