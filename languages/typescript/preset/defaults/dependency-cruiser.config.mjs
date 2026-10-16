import { codeExtensionNames } from '../layout.mjs';
import { readLayout } from '../head-policy.mjs';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mjs';

const { sourceRoots, testRoots, excludePattern } = readLayout();
const sourceRootPattern = `(?:^|/)(?:${sourceRoots.join('|')})/`;
const productionSource = `${sourceRootPattern}(?!.*(?:__tests__|\\.test\\.|\\.spec\\.))`;
export default {
  forbidden: [
    {
      name: 'no-production-to-test',
      severity: 'error',
      from: { path: productionSource },
      to: {
        path: `(?:^|/)(?:(?:${testRoots.join('|')})/|(?:${sourceRoots.join('|')})/.*/__tests__/|(?:${sourceRoots.join('|')})/.*\\.(?:test|spec)\\.)`,
      },
    },
    {
      name: 'no-production-cycles',
      severity: 'error',
      from: { path: productionSource },
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
