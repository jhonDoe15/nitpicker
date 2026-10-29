import { globMatcher } from '../../paths/glob.mjs';

const DEFAULT_FEATURE_LAYOUT = { sharedRoots: ['**/shared'], featureRoots: ['**/features'] };

const INIT_MODULE = /^__init__\.pyi?$/u;
const INDEX_MODULE = /^index\.[cm]?[jt]sx?$/u;

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
  typescript: {
    isPublic: (name) => INDEX_MODULE.test(name),
    describe: (directory) => `${directory}/index.ts`,
  },
};

export function featureLayout(layout = {}) {
  return {
    sharedRoots: layout.sharedRoots ?? DEFAULT_FEATURE_LAYOUT.sharedRoots,
    featureRoots: layout.featureRoots ?? DEFAULT_FEATURE_LAYOUT.featureRoots,
    sharedInsideFeatures: layout.sharedRoots !== undefined,
    notFeatures: layout.notFeatures ?? [],
    notFeatureFolders: layout.notFeatureFolders ?? [],
    aliases: layout.aliases ?? {},
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

export function featureRoles({
  sharedRoots,
  featureRoots,
  sharedInsideFeatures = false,
  notFeatures = [],
  notFeatureFolders = [],
  aliases = {},
}) {
  const shared = sharedRoots.map((glob) => globMatcher(glob));
  const features = featureRoots.map((glob) => globMatcher(glob));
  const excluded = new Set(notFeatures);
  const excludedFolders = new Set(notFeatureFolders);
  return (file) => {
    const prefixes = folderPrefixes(file);
    const sharedFolder = prefixes.find(({ folder }) => matchesAny(shared, folder))?.folder;
    const feature = prefixes.findLast(
      ({ folder, child, isLast }) =>
        !isLast &&
        !excluded.has(child) &&
        !excludedFolders.has(`${folder}/${child}`) &&
        matchesAny(features, folder),
    );
    const folder = feature === undefined ? undefined : `${feature.folder}/${feature.child}`;
    if (isShared(sharedFolder, folder, sharedInsideFeatures)) {
      return { kind: 'shared' };
    }
    if (folder === undefined) {
      return { kind: 'other' };
    }
    const role = { kind: 'feature', directory: folder, name: feature.child };
    return Object.hasOwn(aliases, folder) ? { ...role, directory: aliases[folder], folder } : role;
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
  return withPublicFace(featureRoles(featureLayout(layout)), publicFace);
}

export function withPublicFace(roleOf, publicFace) {
  return (file) => {
    const role = roleOf(file);
    if (role.kind !== 'feature') {
      return role;
    }
    const inside = file.slice((role.folder ?? role.directory).length + 1);
    return {
      ...role,
      isPublic: !inside.includes('/') && publicFace.isPublic(inside),
      face: publicFace.describe(role.directory),
    };
  };
}
