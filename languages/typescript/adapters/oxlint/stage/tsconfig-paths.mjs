import path from 'node:path';
import ts from 'typescript';

export function withRelativePaths(config, directory) {
  const paths = relativePaths(config, directory);
  return paths === undefined
    ? config
    : { ...config, compilerOptions: { ...config.compilerOptions, baseUrl: null, paths } };
}

function relativePaths(config, directory) {
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, directory);
  const base = options.baseUrl ?? options.pathsBasePath;
  if (base === undefined || (options.paths === undefined && options.baseUrl === undefined)) {
    return undefined;
  }
  const mapped = Object.fromEntries(
    Object.entries(options.paths ?? {}).map(([pattern, targets]) => [
      pattern,
      targets.map((target) => relativeTarget(directory, base, target)),
    ]),
  );
  return options.baseUrl === undefined || Object.hasOwn(mapped, '*')
    ? mapped
    : { ...mapped, '*': [relativeTarget(directory, base, '*')] };
}

function relativeTarget(directory, base, target) {
  const location = path.relative(directory, path.resolve(base, target)).split(path.sep).join('/');
  return location.startsWith('../') ? location : `./${location}`;
}
