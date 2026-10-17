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

export const featureLayout = {
  sharedRoots: layout.sharedRoots ?? sourceRoots.map((root) => `**/${root}/${SHARED}`),
  featureRoots: layout.featureRoots ?? sourceRoots.map((root) => `**/${root}/${FEATURES}`),
};
