export const FEATURES_FOLDER = 'main/features';
export const SHARED_FOLDER = 'main/shared';

export function typescriptFeatureLayout(layout, sourceRoots) {
  return {
    sharedRoots: layout?.sharedRoots ?? sourceRoots.map((root) => `**/${root}/${SHARED_FOLDER}`),
    featureRoots:
      layout?.featureRoots ?? sourceRoots.map((root) => `**/${root}/${FEATURES_FOLDER}`),
    sharedInsideFeatures: layout?.sharedRoots !== undefined,
  };
}
