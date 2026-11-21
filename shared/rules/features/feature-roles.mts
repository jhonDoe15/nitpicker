import { globMatcher } from '../../paths/glob.mts';
import { fieldOf, objectOf } from '../../values/readers.mts';
import type {
  FeatureLayout,
  FeatureLayoutInput,
  FeatureRole,
  FeatureSide,
  PublicFace,
  PublicFeatureRole,
  RoleLayout,
  RoleLike,
} from './typed/role-types.mts';

const DEFAULT_FEATURE_LAYOUT = { sharedRoots: ['**/shared'], featureRoots: ['**/features'] };

const INIT_MODULE = /^__init__\.pyi?$/u;
const INDEX_MODULE = /^index\.[cm]?[jt]sx?$/u;

export const PUBLIC_FACES: Readonly<Record<'python' | 'jvm' | 'go' | 'typescript', PublicFace>> = {
  python: {
    isPublic: (name) => INIT_MODULE.test(name) || !name.startsWith('_'),
    describe: (directory) =>
      `${directory}/__init__.py (re-export names or sub-packages there) or a module directly in ${directory}/ not starting with "_"`,
  },
  jvm: {
    isPublic: () => true,
    describe: (directory) => `a class directly in ${directory}/`,
  },
  go: {
    isPublic: () => true,
    describe: (directory) => `the package directly in ${directory}/`,
  },
  typescript: {
    isPublic: (name) => INDEX_MODULE.test(name),
    describe: (directory) => `${directory}/index.ts`,
  },
};

export function isFeatureSide(role: RoleLike): role is FeatureSide {
  return (
    role.kind === 'feature' && typeof role.directory === 'string' && typeof role.name === 'string'
  );
}

export function featureLayout(layout: FeatureLayoutInput = {}): FeatureLayout {
  return {
    sharedRoots: layout.sharedRoots ?? DEFAULT_FEATURE_LAYOUT.sharedRoots,
    featureRoots: layout.featureRoots ?? DEFAULT_FEATURE_LAYOUT.featureRoots,
    sharedInsideFeatures: Boolean(layout.sharedInsideFeatures ?? layout.sharedRoots !== undefined),
    notFeatures: layout.notFeatures ?? [],
    notFeatureFolders: layout.notFeatureFolders ?? [],
    aliases: layout.aliases ?? {},
  };
}

type Prefix = { readonly folder: string; readonly child: string; readonly isLast: boolean };

function folderPrefixes(file: string): Prefix[] {
  const parts = file.split('/');
  return parts.slice(1).map((child, index) => ({
    folder: parts.slice(0, index + 1).join('/'),
    child,
    isLast: index + 2 === parts.length,
  }));
}

function matchesAny(
  patterns: readonly { test(value: string): boolean }[],
  folder: string,
): boolean {
  return patterns.some((pattern) => pattern.test(folder));
}

function joinedFolder(folder: string, child: string): string {
  return [folder, child].join('/');
}

function isShared(
  sharedFolder: string | undefined,
  featureDirectory: string | undefined,
  sharedInsideFeatures: boolean,
): boolean {
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
}: RoleLayout): (file: string) => FeatureRole {
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
        !excludedFolders.has(joinedFolder(folder, child)) &&
        matchesAny(features, folder),
    );
    const folder = feature === undefined ? undefined : joinedFolder(feature.folder, feature.child);
    if (isShared(sharedFolder, folder, sharedInsideFeatures)) {
      return { kind: 'shared' };
    }
    if (feature === undefined || folder === undefined) {
      return { kind: 'other' };
    }
    const role: FeatureSide = { kind: 'feature', directory: folder, name: feature.child };
    const alias = Object.hasOwn(aliases, folder) ? aliases[folder] : undefined;
    return alias === undefined ? role : { ...role, directory: alias, folder };
  };
}

function isPublicFace(face: unknown): face is PublicFace {
  return (
    typeof fieldOf(face, 'isPublic') === 'function' &&
    typeof fieldOf(face, 'describe') === 'function'
  );
}

export function featureRoleContract(
  layout: unknown,
  publicFace: unknown,
): (file: string) => FeatureRole | PublicFeatureRole {
  if (!isPublicFace(publicFace)) {
    throw new TypeError(
      '"publicFace" must be { isPublic, describe }, such as PUBLIC_FACES.python (shared/rules/features/feature-roles.mjs): the feature boundary rules need to know which files a feature exposes',
    );
  }
  return withPublicFace(featureRoles(featureLayout(objectOf(layout))), publicFace);
}

export function withPublicFace<Role extends RoleLike>(
  roleOf: (file: string) => Role,
  publicFace: PublicFace,
): (file: string) => Role | (Role & { readonly isPublic: boolean; readonly face: string }) {
  return (file) => {
    const role = roleOf(file);
    if (role.kind !== 'feature') {
      return role;
    }
    const inside = file.slice((role.folder ?? role.directory ?? '').length + 1);
    return {
      ...role,
      isPublic: !inside.includes('/') && publicFace.isPublic(inside),
      face: publicFace.describe(role.directory ?? ''),
    };
  };
}
