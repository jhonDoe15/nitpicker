import { escapeRegExp } from '../../../../shared/paths/glob.mts';
import { PROJECT_ROOT, rootPrefixPattern, underRoot } from './source-root/root-paths.mts';
import { rootScopedGlobs, sourceRootGlobs } from '../test-runner/test-files/test-file-patterns.mts';
import type {
  FilePatterns,
  FilePatternsInput,
  GlobsInput,
  LayoutGlobs,
  RootsInput,
} from './layout-types.mts';

const TEST_SUPPORT_DIRECTORY = 'test-support';

export function filePatterns({
  sourceRoots,
  testRoots,
  extensions,
  colocatedTests,
}: FilePatternsInput): FilePatterns {
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
  const sourceSource = `^(?:${sourcePrefixes}).*\\.${suffix}`;
  const sourcePattern = new RegExp(sourceSource);
  return { testPattern, sourcePattern, codePattern: new RegExp(`\\.${suffix}`) };
}

function unitTestGlobsFor({
  sourceRoots,
  testRoots,
  javascript,
  extensionGlob,
}: RootsInput & { javascript: boolean; extensionGlob: string }): string[] {
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
}: GlobsInput): LayoutGlobs {
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

function graphIncludeOnly(roots: readonly string[]): string {
  return roots.includes(PROJECT_ROOT) ? '^' : `^(${roots.map(escapeRegExp).join('|')})(?:/|$)`;
}
