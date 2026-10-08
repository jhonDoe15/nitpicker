import { codeExtensionNames, sourceRoot as layoutSourceRoot, testRoots } from '../layout.mjs';

const sourceRoot = `(?:^|/)${layoutSourceRoot}/`;
const productionSource = `${sourceRoot}(?!.*(?:__tests__|\\.test\\.|\\.spec\\.))`;
export default {
  forbidden: [
    {
      name: 'no-production-to-test',
      severity: 'error',
      from: { path: productionSource },
      to: {
        path: `(?:^|/)(?:${testRoots.join('|')}/|${layoutSourceRoot}/.*/__tests__/|${layoutSourceRoot}/.*\\.(?:test|spec)\\.)`,
      },
    },
    {
      name: 'no-production-cycles',
      severity: 'error',
      from: { path: productionSource },
      to: { circular: true },
    },
  ],
  required: [],
  options: {
    doNotFollow: {
      path: '(?:^|/)(?:node_modules|dist|build|generated|coverage|reports|target)(?:/|$)',
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
