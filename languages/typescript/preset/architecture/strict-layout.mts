import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mts';
import {
  FEATURES_FOLDER,
  SHARED_FOLDER,
  typescriptFeatureLayout,
} from '../coupling/feature-layout.mts';
import { rootPattern } from '../layout/source-root/root-paths.mts';
import { readHeadPolicy, readLayout as untypedReadLayout } from '../head-policy.mts';
import type { LayoutFeatures, TestPathLayout } from './typed/rule-types.mts';

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;
const readLayout: () => TestPathLayout = untypedReadLayout;

const resolvedLayout = readLayout();
const { sourceRoots } = resolvedLayout;
const { layout } = readHeadPolicy();

const sourceRoot = rootPattern(sourceRoots);

const main = `(?:^|/)${sourceRoot}main`;

export const layoutFeatures: LayoutFeatures = {
  featureRoot: `(?:^|/)${sourceRoot}${FEATURES_FOLDER}`,
  feature: `(?:^|/)${sourceRoot}${FEATURES_FOLDER}/[^/]+`,
  shared: `(?:^|/)${sourceRoot}${SHARED_FOLDER}/`,
  compositionRoot: `${main}/composition-root(?:\\.[cm]?[jt]sx?$|/)`,
};

export function testFilePathPatterns(resolved: TestPathLayout, projectRoot: string): string[] {
  const roots = rootPattern(resolved.sourceRoots);
  const colocated = resolved
    .projectCodeFiles(projectRoot, resolved.sourceRoots)
    .filter((file) => resolved.isTestFile(file) && !resolved.isTestPath(file))
    .map((file) => `(?:^|/)${escapeRegExp(file)}$`);
  return [
    `^(?:${resolved.testRoots.join('|')})/`,
    `(?:^|/)${roots}.*/__tests__/`,
    `(?:^|/)${roots}.*\\.(?:test|spec)\\.`,
    ...colocated,
  ];
}

export const testFilePaths = testFilePathPatterns(resolvedLayout, '.');

export const featureLayout = typescriptFeatureLayout(layout, sourceRoots);
