import path from 'node:path';

export function withRelativePaths(options, { directory, resolvedOptions }) {
  const { baseUrl, paths, ...rest } = options;
  if (baseUrl === undefined && paths === undefined) return options;
  const base =
    baseUrl === undefined ? resolvedOptions.pathsBasePath : path.resolve(directory, baseUrl);
  const mapped = Object.fromEntries(
    Object.entries(resolvedOptions.paths ?? {}).map(([pattern, targets]) => [
      pattern,
      substitutions(pattern, targets).map((target) =>
        relativeLocation(directory, path.resolve(base, target)),
      ),
    ]),
  );
  const restated =
    baseUrl === undefined || Object.hasOwn(mapped, '*')
      ? mapped
      : { ...mapped, '*': [relativeLocation(directory, path.resolve(base, '*'))] };
  return { ...rest, paths: restated };
}

export function relativeLocation(directory, location) {
  const relative = path.relative(directory, location);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return location.split(path.sep).join('/');
  }
  return `./${relative.split(path.sep).join('/')}`;
}

function substitutions(pattern, targets) {
  if (!Array.isArray(targets) || !targets.every((target) => typeof target === 'string')) {
    throw new TypeError(
      `The tsconfig "paths" entry "${pattern}" must be an array of locations, such as ["./src/*"].`,
    );
  }
  return targets;
}
