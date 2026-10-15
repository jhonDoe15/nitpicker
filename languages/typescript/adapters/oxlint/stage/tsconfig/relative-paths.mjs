import path from 'node:path';

export function withRelativePaths(options, { directory, resolvedOptions }) {
  const { baseUrl, paths, ...rest } = options;
  if (baseUrl === undefined && paths === undefined) return options;
  const base =
    baseUrl === undefined ? resolvedOptions.pathsBasePath : path.resolve(directory, baseUrl);
  const mapped = Object.fromEntries(
    Object.entries(paths ?? {}).map(([pattern, targets]) => [
      pattern,
      targets.map((target) => relativeLocation(directory, path.resolve(base, target))),
    ]),
  );
  const restated =
    baseUrl === undefined || Object.hasOwn(mapped, '*')
      ? mapped
      : { ...mapped, '*': [relativeLocation(directory, path.resolve(base, '*'))] };
  return { ...rest, paths: restated };
}

export function relativeLocation(directory, location) {
  const relative = path.relative(directory, location).split(path.sep).join('/');
  return relative.startsWith('../') ? relative : `./${relative}`;
}
