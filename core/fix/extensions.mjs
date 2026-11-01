export const typescriptExtensions = new Set(['.ts', '.mts', '.cts', '.tsx']);

export const prettierExtensions = new Set([
  ...typescriptExtensions,
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.mdx',
  '.graphql',
  '.gql',
  '.html',
  '.css',
  '.scss',
  '.less',
]);

export const prettierExclusions = [
  /^(?:coverage|reports\/quality|\.stryker-tmp)\//,
  /^src\/main\/dist\//,
];
