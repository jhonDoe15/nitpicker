import { codeExtensionNames } from '../layout.mjs';
import { readLayout } from '../head-policy.mjs';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mjs';
import { testFilePaths } from '../architecture/strict-layout.mjs';

const { sourceRoots, excludePattern } = readLayout();
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
    ...strictBoundaryRules,
  ],
  required: [],
  options: {
    preserveSymlinks: true,
    doNotFollow: {
      path: [
        '(?:^|/)(?:node_modules|dist|build|generated|coverage|reports|target)(?:/|$)',
        excludePattern,
      ]
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
