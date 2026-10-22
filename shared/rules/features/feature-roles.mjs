import { globMatcher } from '../../paths/glob.mjs';

export const DEFAULT_FEATURE_LAYOUT = { sharedRoots: ['**/shared'], featureRoots: ['**/features'] };

const INIT_MODULE = /^__init__\.pyi?$/u;

export const PUBLIC_FACES = {
  python: {
    isPublic: (name) => INIT_MODULE.test(name) || !name.startsWith('_'),
    describe: (directory) =>
      `its __init__.py (a name it imports from an internal module counts) or a module directly in ${directory}/ whose name does not start with "_"`,
  },
  jvm: {
    isPublic: () => true,
    describe: (directory) => `a class directly in the feature package ${directory}/`,
  },
};

export function featureLayout(layout = {}) {
  return {
    sharedRoots: layout.sharedRoots ?? DEFAULT_FEATURE_LAYOUT.sharedRoots,
    featureRoots: layout.featureRoots ?? DEFAULT_FEATURE_LAYOUT.featureRoots,
  };
}

function folderPrefixes(file) {
  const parts = file.split('/');
  return parts.slice(1).map((_, index) => ({
    folder: parts.slice(0, index + 1).join('/'),
    child: parts[index + 1],
    isLast: index + 2 === parts.length,
  }));
}

function matchesAny(patterns, folder) {
  return patterns.some((pattern) => pattern.test(folder));
}

function isSharedAbove(sharedFolder, featureDirectory) {
  return (
    sharedFolder !== undefined &&
    (featureDirectory === undefined || sharedFolder.length <= featureDirectory.length)
  );
}

export function featureRoles({ sharedRoots, featureRoots }) {
  const shared = sharedRoots.map((glob) => globMatcher(glob));
  const features = featureRoots.map((glob) => globMatcher(glob));
  return (file) => {
    const prefixes = folderPrefixes(file);
    const sharedFolder = prefixes.find(({ folder }) => matchesAny(shared, folder))?.folder;
    const feature = prefixes.find(({ folder, isLast }) => !isLast && matchesAny(features, folder));
    const directory = feature === undefined ? undefined : `${feature.folder}/${feature.child}`;
    if (isSharedAbove(sharedFolder, directory)) {
      return { kind: 'shared' };
    }
    return directory === undefined ? { kind: 'other' } : { kind: 'feature', directory };
  };
}

function isPublicFace(face) {
  return typeof face?.isPublic === 'function' && typeof face.describe === 'function';
}

export function featureRoleContract(layout, publicFace) {
  if (!isPublicFace(publicFace)) {
    throw new TypeError(
      '"publicFace" must be { isPublic, describe }, such as PUBLIC_FACES.python (shared/rules/features/feature-roles.mjs): the feature boundary rules need to know which files a feature exposes',
    );
  }
  const roleOf = featureRoles(featureLayout(layout));
  return (file) => {
    const role = roleOf(file);
    if (role.kind !== 'feature') {
      return role;
    }
    const inside = file.slice(role.directory.length + 1);
    return {
      ...role,
      name: role.directory.split('/').at(-1),
      isPublic: !inside.includes('/') && publicFace.isPublic(inside),
      face: publicFace.describe(role.directory),
    };
  };
}
