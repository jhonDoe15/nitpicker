import { EXCLUDED_PATH_PATTERN, codeExtensionNames } from '../layout.mts';
import { rootPattern } from '../layout/source-root/root-paths.mts';
import { readLayout } from '../head-policy.mts';
import { outsideRootsRule } from '../architecture/outside-roots/outside-roots.mts';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mts';
import { testFilePaths } from '../architecture/strict-layout.mts';

const { sourceRoots, testRoots, excludePattern, generatedFilePattern } = readLayout();
const productionSource = {
  path: `(?:^|/)${rootPattern(sourceRoots)}`,
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
