import path from 'node:path';
import { featureLayout, featureRoles } from '../../features/feature-roles.mjs';

const DEFAULT_ROLES = featureRoles(featureLayout());
const SHARED_FOLDER = 'shared';
const PROBE = 'module';

function folderOf(file) {
  const folder = path.posix.dirname(file);
  return folder === '.' ? '' : folder;
}

function commonFolder(folders) {
  const [first, ...rest] = folders.map((folder) => (folder === '' ? [] : folder.split('/')));
  const shared = first.filter((part, index) => rest.every((other) => other[index] === part));
  return first.slice(0, shared.length).join('/');
}

function sharedPrefix(left, right) {
  return commonFolder([left, right]).length;
}

function ancestors(folder) {
  const parts = folder === '' ? [] : folder.split('/');
  return parts.map((_, index) => parts.slice(0, parts.length - index).join('/')).concat('');
}

function probe(folder) {
  return folder === '' ? PROBE : `${folder}/${PROBE}`;
}

function isFeatureRoot(folder, roleOf) {
  return roleOf(`${probe(folder)}/${PROBE}`).kind === 'feature';
}

function existingSharedFolders(files, roleOf) {
  return [...new Set(files.filter((file) => roleOf(file).kind === 'shared').map(folderOf))];
}

function nearestShared(common, { files, roleOf }) {
  const existing = existingSharedFolders(files, roleOf)
    .filter((folder) => roleOf(probe(folder)).kind === 'shared')
    .toSorted(
      (left, right) =>
        sharedPrefix(right, common) - sharedPrefix(left, common) ||
        left.length - right.length ||
        left.localeCompare(right),
    );
  if (existing.length > 0) {
    return existing[0];
  }
  return ancestors(common)
    .filter((folder) => !isFeatureRoot(folder, roleOf))
    .map((folder) => (folder === '' ? SHARED_FOLDER : `${folder}/${SHARED_FOLDER}`))
    .find((folder) => roleOf(probe(folder)).kind === 'shared');
}

function featureName(role) {
  return role.name ?? role.directory;
}

/**
 * The folder for the function extracted from two copies: the nearest shared folder that the
 * layout allows, or the nearest common folder when a shared folder would have one user only.
 * `roleOf(file)` is the feature role of a file; `files` are the project files it can see.
 */
export function suggestedPlace(paths, { roleOf = DEFAULT_ROLES, files = [] } = {}) {
  const common = commonFolder(paths.map(folderOf));
  const roles = paths.map((file) => roleOf(file));
  const [first] = roles;
  const sameFeature =
    first.kind === 'feature' &&
    roles.every((role) => role.kind === 'feature' && role.directory === first.directory);
  if (sameFeature) {
    return {
      folder: common,
      kind: 'feature',
      reason: `both copies are in the ${featureName(first)} feature, so a shared folder would have one feature as its only user (shared-used-by-one-feature)`,
    };
  }
  if (roles.every(({ kind }) => kind === 'shared')) {
    return { folder: common, kind: 'shared', reason: 'both copies are already in shared code' };
  }
  const shared = nearestShared(common, { files: [...files, ...paths], roleOf });
  if (shared === undefined) {
    return {
      folder: common,
      kind: 'common',
      reason:
        'the layout rules name no shared folder for these files, so this is their nearest common folder',
    };
  }
  return {
    folder: shared,
    kind: 'shared',
    reason:
      'the copies are in different places, and shared code may be used by several features (shared-used-by-one-feature)',
  };
}
