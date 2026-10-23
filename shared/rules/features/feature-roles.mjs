import { globMatcher } from '../../paths/glob.mjs';

const DEFAULT_FEATURE_LAYOUT = { sharedRoots: ['**/shared'], featureRoots: ['**/features'] };

const INIT_MODULE = /^__init__\.pyi?$/u;

export const PUBLIC_FACES = {
  python: {
    isPublic: (name) => INIT_MODULE.test(name) || !name.startsWith('_'),
    describe: (directory) =>
      `${directory}/__init__.py (re-export names or sub-packages there) or a module directly in ${directory}/ not starting with "_"`,
  },
  jvm: {
    isPublic: () => true,
    describe: (directory) => `a class directly in ${directory}/`,
  },
};

export function featureLayout(layout = {}) {
  return {
    sharedRoots: layout.sharedRoots ?? DEFAULT_FEATURE_LAYOUT.sharedRoots,
    featureRoots: layout.featureRoots ?? DEFAULT_FEATURE_LAYOUT.featureRoots,
    sharedInsideFeatures: layout.sharedRoots !== undefined,
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

function isShared(sharedFolder, featureDirectory, sharedInsideFeatures) {
  return (
    sharedFolder !== undefined &&
    (sharedInsideFeatures ||
      featureDirectory === undefined ||
      sharedFolder.length <= featureDirectory.length)
  );
}

export function featureRoles({ sharedRoots, featureRoots, sharedInsideFeatures = false }) {
  const shared = sharedRoots.map((glob) => globMatcher(glob));
  const features = featureRoots.map((glob) => globMatcher(glob));
  return (file) => {
    const prefixes = folderPrefixes(file);
    const sharedFolder = prefixes.find(({ folder }) => matchesAny(shared, folder))?.folder;
    const feature = prefixes.findLast(
      ({ folder, isLast }) => !isLast && matchesAny(features, folder),
    );
    const directory = feature === undefined ? undefined : `${feature.folder}/${feature.child}`;
    if (isShared(sharedFolder, directory, sharedInsideFeatures)) {
      return { kind: 'shared' };
    }
    return directory === undefined
      ? { kind: 'other' }
      : { kind: 'feature', directory, name: feature.child };
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
      isPublic: !inside.includes('/') && publicFace.isPublic(inside),
      face: publicFace.describe(role.directory),
    };
  };
}
