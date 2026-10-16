import { readHeadPolicy, readLayout } from '../head-policy.mjs';

const { sourceRoots } = readLayout();
const { layout } = readHeadPolicy();

const sourceRoot = `(?:${sourceRoots.join('|')})`;

const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `${main}/features`,
  feature: `${main}/features/[^/]+`,
  shared: `${main}/shared/`,
  compositionRoot: `${main}/composition-root(?:\\.[cm]?[jt]sx?$|/)`,
};

export const featureLayout = {
  sharedRoots: layout.sharedRoots ?? sourceRoots.map((root) => `**/${root}/main/shared`),
  featureRoots: layout.featureRoots ?? sourceRoots.map((root) => `**/${root}/main/features`),
};
