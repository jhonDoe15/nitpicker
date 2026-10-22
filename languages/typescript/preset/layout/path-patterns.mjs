import { escapeRegExp } from '../../../../shared/glob.mjs';

const TEST_SUPPORT_DIRECTORY = 'test-support';

export function filePatterns({ sourceRoots, testRoots, extensions, colocatedTests }) {
  const sourceAlternatives = sourceRoots.map(escapeRegExp).join('|');
  const testAlternatives = testRoots.map(escapeRegExp).join('|');
  const suffix = `(?:${extensions.join('|')})$`;
  const testPattern = new RegExp(
    [
      `^(?:${testAlternatives})/`,
      `^(?:${sourceAlternatives})/.*\\.(?:test|spec)\\.${suffix}`,
      `^(?:${sourceAlternatives})/(?:.*/)?__tests__/`,
      ...(colocatedTests ? [`^(?:${sourceAlternatives})/(?:.*/)?${TEST_SUPPORT_DIRECTORY}/`] : []),
    ]
      .map((pattern) => `(?:${pattern})`)
      .join('|'),
  );
  const sourcePattern = new RegExp(`^(?:${sourceAlternatives})/.*\\.${suffix}`);
  return {
    testPattern,
    sourcePattern,
    codePattern: new RegExp(`\\.${suffix}`),
    runnableTestPattern: new RegExp(`\\.(?:test|spec)\\.${suffix}`),
  };
}

function unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }) {
  const extension = javascript ? extensionGlob : 'ts';
  return [
    ...sourceRoots.map((root) => `${root}/**/__tests__/**/*.${extension}`),
    ...testRoots.map((root) => `${root}/unit/**/*.${extension}`),
  ];
}

export function globsFor({ sourceRoots, testRoots, javascript, extensionGlob, colocatedTests }) {
  return {
    testSupportGlobs: colocatedTests
      ? sourceRoots.map((root) => `${root}/**/${TEST_SUPPORT_DIRECTORY}/**`)
      : [],
    sourceGlobs: sourceRoots.map((root) => `${root}/**/*.${extensionGlob}`),
    testGlobs: [
      ...testRoots.map((root) => `${root}/**/*.${extensionGlob}`),
      ...sourceRoots.map((root) => `${root}/**/*.{test,spec}.${extensionGlob}`),
    ],
    sourceTestDirectoryGlobs: sourceRoots.map((root) => `${root}/**/__tests__/**`),
    unitTestGlobs: unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }),
    graphRoots: [...sourceRoots, ...testRoots],
    graphIncludeOnly: `^(${[...sourceRoots, ...testRoots].map(escapeRegExp).join('|')})(?:/|$)`,
  };
}
