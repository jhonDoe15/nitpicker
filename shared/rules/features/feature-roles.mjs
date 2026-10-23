import { globMatcher } from '../../paths/glob.mjs';

export const DEFAULT_FEATURE_LAYOUT = { sharedRoots: ['**/shared'], featureRoots: ['**/features'] };

function folderPrefixes(file) {
  const parts = file.split('/');
  return parts.slice(1).map((_, index) => ({
    folder: parts.slice(0, index + 1).join('/'),
    child: parts[index + 1],
    isLast: index + 2 === parts.length,
  }));
}

export function featureRoles({ sharedRoots, featureRoots }) {
  const shared = sharedRoots.map((glob) => globMatcher(glob));
  const features = featureRoots.map((glob) => globMatcher(glob));
  return (file) => {
    const prefixes = folderPrefixes(file);
    if (prefixes.some(({ folder }) => shared.some((pattern) => pattern.test(folder)))) {
      return { kind: 'shared' };
    }
    const feature = prefixes.find(
      ({ folder, isLast }) => !isLast && features.some((pattern) => pattern.test(folder)),
    );
    return feature === undefined
      ? { kind: 'other' }
      : { kind: 'feature', directory: `${feature.folder}/${feature.child}` };
  };
}
