import { sourceRoot } from '../layout.mjs';

// Path patterns for the layout the strict preset fixes (docs/typescript-strict-preset.md).
const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `${main}/features`,
  feature: `${main}/features/[^/]+`,
  shared: `${main}/shared/`,
  compositionRoot: `${main}/composition-root(?:${'\\.[cm]?[jt]sx?$'}|/)`,
};
