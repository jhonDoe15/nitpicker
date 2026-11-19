import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { PROJECT_ROOT, rootPrefixPattern, underRoot } from './source-root/root-paths.mjs';
import { rootScopedGlobs, sourceRootGlobs } from '../test-runner/test-files/test-file-patterns.mjs';

const TEST_SUPPORT_DIRECTORY = 'test-support';

export function filePatterns({ sourceRoots, testRoots, extensions, colocatedTests }) {
  const sourcePrefixes = rootPrefixPattern(sourceRoots);
  const testAlternatives = testRoots.map(escapeRegExp).join('|');
  const suffix = `(?:${extensions.map(escapeRegExp).join('|')})$`;
  const testPattern = new RegExp(
    [
      `^(?:${testAlternatives})/`,
      `^(?:${sourcePrefixes}).*\\.(?:test|spec)\\.${suffix}`,
      `^(?:${sourcePrefixes})(?:.*/)?__tests__/`,
      ...(colocatedTests ? [`^(?:${sourcePrefixes})(?:.*/)?${TEST_SUPPORT_DIRECTORY}/`] : []),
    ]
      .map((pattern) => `(?:${pattern})`)
      .join('|'),
  );
  const sourcePattern = new RegExp(`^(?:${sourcePrefixes}).*\\.${suffix}`);
  return { testPattern, sourcePattern, codePattern: new RegExp(`\\.${suffix}`) };
}

function unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }) {
  const extension = javascript ? extensionGlob : 'ts';
  return [
    ...sourceRoots.map((root) => underRoot(root, `**/__tests__/**/*.${extension}`)),
    ...testRoots.map((root) => underRoot(root, `unit/**/*.${extension}`)),
  ];
}

export function globsFor({
  sourceRoots,
  testRoots,
  javascript,
  extensionGlob,
  colocatedTests,
  testFiles,
}) {
  return {
    testSupportGlobs: colocatedTests
      ? sourceRoots.map((root) => underRoot(root, `**/${TEST_SUPPORT_DIRECTORY}/**`))
      : [],
    sourceGlobs: sourceRoots.map((root) => underRoot(root, `**/*.${extensionGlob}`)),
    testGlobs: [
      ...testRoots.map((root) => underRoot(root, `**/*.${extensionGlob}`)),
      ...sourceRoots.map((root) => underRoot(root, `**/*.{test,spec}.${extensionGlob}`)),
      ...sourceRootGlobs(sourceRoots, testFiles),
    ],
    runnerSourceTestGlobs: sourceRootGlobs(sourceRoots, testFiles),
    runnableTestGlobs: rootScopedGlobs([...sourceRoots, ...testRoots], testFiles.include),
    sourceTestDirectoryGlobs: sourceRoots.map((root) => underRoot(root, '**/__tests__/**')),
    unitTestGlobs: unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }),
    graphRoots: [...sourceRoots, ...testRoots],
    graphIncludeOnly: graphIncludeOnly([...sourceRoots, ...testRoots]),
  };
}

function graphIncludeOnly(roots) {
  return roots.includes(PROJECT_ROOT) ? '^' : `^(${roots.map(escapeRegExp).join('|')})(?:/|$)`;
}
