import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import {
  FEATURES_FOLDER,
  SHARED_FOLDER,
  typescriptFeatureLayout,
} from '../coupling/feature-layout.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';

const resolvedLayout = readLayout();
const { sourceRoots } = resolvedLayout;
const { layout } = readHeadPolicy();

const sourceRoot = `(?:${sourceRoots.join('|')})`;

const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `(?:^|/)${sourceRoot}/${FEATURES_FOLDER}`,
  feature: `(?:^|/)${sourceRoot}/${FEATURES_FOLDER}/[^/]+`,
  shared: `(?:^|/)${sourceRoot}/${SHARED_FOLDER}/`,
  compositionRoot: `${main}/composition-root(?:\\.[cm]?[jt]sx?$|/)`,
};

export function testFilePathPatterns(resolved, projectRoot) {
  const roots = `(?:${resolved.sourceRoots.join('|')})`;
  const colocated = resolved
    .projectCodeFiles(projectRoot, resolved.sourceRoots)
    .filter((file) => resolved.isTestFile(file) && !resolved.isTestPath(file))
    .map((file) => `(?:^|/)${escapeRegExp(file)}$`);
  return [
    `^(?:${resolved.testRoots.join('|')})/`,
    `(?:^|/)${roots}/.*/__tests__/`,
    `(?:^|/)${roots}/.*\\.(?:test|spec)\\.`,
    ...colocated,
  ];
}

export const testFilePaths = testFilePathPatterns(resolvedLayout, '.');

export const featureLayout = typescriptFeatureLayout(layout, sourceRoots);
