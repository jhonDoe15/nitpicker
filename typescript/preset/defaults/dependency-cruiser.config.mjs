const sourceRoot = '(?:^|/)src/main/';
const productionSource = `${sourceRoot}(?!.*(?:__tests__|\\.test\\.|\\.spec\\.))`;
export default {
  forbidden: [
    {
      name: 'no-production-to-test',
      severity: 'error',
      from: { path: productionSource },
      to: { path: '(?:^|/)(?:tests/|src/main/.*/__tests__/)' },
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
      extensions: ['.ts', '.mts', '.js', '.mjs', '.json'],
    },
  },
};
