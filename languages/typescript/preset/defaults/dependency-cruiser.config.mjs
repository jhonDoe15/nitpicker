import { EXCLUDED_PATH_PATTERN, codeExtensionNames } from '../layout.mjs';
import { readLayout } from '../head-policy.mjs';
import { outsideRootsRule } from '../architecture/outside-roots/outside-roots.mjs';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mjs';
import { testFilePaths } from '../architecture/strict-layout.mjs';

const { sourceRoots, testRoots, excludePattern, generatedFilePattern } = readLayout();
const productionSource = {
  path: `(?:^|/)(?:${sourceRoots.join('|')})/`,
  pathNot: testFilePaths,
};
export default {
  forbidden: [
    {
      name: 'no-production-to-test',
      severity: 'error',
      from: productionSource,
      to: { path: testFilePaths },
    },
    {
      name: 'no-production-cycles',
      severity: 'error',
      from: productionSource,
      to: { circular: true },
    },
    outsideRootsRule({
      productionSource,
      roots: [...sourceRoots, ...testRoots],
      excludePattern,
      generatedFilePattern,
    }),
    ...strictBoundaryRules,
  ],
  required: [],
  options: {
    preserveSymlinks: true,
    doNotFollow: {
      path: [EXCLUDED_PATH_PATTERN, excludePattern]
        .filter((pattern) => pattern !== undefined)
        .join('|'),
    },
    tsConfig: {
      fileName: 'tsconfig.quality.json',
    },
    tsPreCompilationDeps: 'specify',
    enhancedResolveOptions: {
      extensions: [...codeExtensionNames.map((extension) => `.${extension}`), '.json'],
    },
  },
};
