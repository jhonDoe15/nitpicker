import { readLayout } from '../head-policy.mjs';

const sourceRoot = `(?:${readLayout().sourceRoots.join('|')})`;

const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `${main}/features`,
  feature: `${main}/features/[^/]+`,
  shared: `${main}/shared/`,
  compositionRoot: `${main}/composition-root(?:\\.[cm]?[jt]sx?$|/)`,
};
