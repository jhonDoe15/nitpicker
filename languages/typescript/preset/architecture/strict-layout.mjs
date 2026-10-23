import {
  FEATURES_FOLDER,
  SHARED_FOLDER,
  typescriptFeatureLayout,
} from '../coupling/feature-layout.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';

const { sourceRoots } = readLayout();
const { layout } = readHeadPolicy();

const sourceRoot = `(?:${sourceRoots.join('|')})`;

const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `(?:^|/)${sourceRoot}/${FEATURES_FOLDER}`,
  feature: `(?:^|/)${sourceRoot}/${FEATURES_FOLDER}/[^/]+`,
  shared: `(?:^|/)${sourceRoot}/${SHARED_FOLDER}/`,
  compositionRoot: `${main}/composition-root(?:\\.[cm]?[jt]sx?$|/)`,
};

export const featureLayout = typescriptFeatureLayout(layout, sourceRoots);
