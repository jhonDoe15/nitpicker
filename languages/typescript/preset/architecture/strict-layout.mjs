import { escapeRegExp } from '../../../../shared/glob.mjs';
import { readLayout } from '../head-policy.mjs';

const layout = readLayout();

const sourceRoot = `(?:${layout.sourceRoots.join('|')})`;

const main = `(?:^|/)${sourceRoot}/main`;

export const layoutFeatures = {
  featureRoot: `${main}/features`,
  feature: `${main}/features/[^/]+`,
  shared: `${main}/shared/`,
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

export const testFilePaths = testFilePathPatterns(layout, '.');
