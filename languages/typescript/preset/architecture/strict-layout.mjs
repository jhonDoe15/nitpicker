import { readHeadPolicy, readLayout } from '../head-policy.mjs';

const { sourceRoots } = readLayout();
const { layout } = readHeadPolicy();

const FEATURES = 'main/features';
const SHARED = 'main/shared';

const sourceRoot = `(?:${sourceRoots.join('|')})`;

const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `(?:^|/)${sourceRoot}/${FEATURES}`,
  feature: `(?:^|/)${sourceRoot}/${FEATURES}/[^/]+`,
  shared: `(?:^|/)${sourceRoot}/${SHARED}/`,
  compositionRoot: `${main}/composition-root(?:\\.[cm]?[jt]sx?$|/)`,
};

export function featureLayoutOf(roots, configured = {}) {
  return {
    sharedRoots: configured.sharedRoots ?? roots.map((root) => `**/${root}/${SHARED}`),
    featureRoots: configured.featureRoots ?? roots.map((root) => `**/${root}/${FEATURES}`),
  };
}

export const featureLayout = featureLayoutOf(sourceRoots, layout);
