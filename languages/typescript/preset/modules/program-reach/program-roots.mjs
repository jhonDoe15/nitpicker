import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_TSCONFIG, parsedTsconfig } from '../tsconfig-files.mjs';

const DEPENDENCY_FOLDER = 'node_modules';

function directoryOf(target) {
  const literal = target.includes('*') ? target.slice(0, target.indexOf('*')) : target;
  const whole = literal.endsWith('/') || literal.endsWith(path.sep);
  const candidate = whole || literal === target ? literal : path.dirname(literal);
  if (!existsSync(candidate)) {
    return undefined;
  }
  return statSync(candidate).isDirectory() ? path.resolve(candidate) : path.dirname(candidate);
}

function isInside(directory, root) {
  const relative = path.relative(root, directory);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function outermost(directories) {
  const unique = [...new Set(directories)];
  return unique.filter(
    (directory) => !unique.some((other) => other !== directory && isInside(directory, other)),
  );
}

function reachedDirectories(configFile) {
  const { options, projectReferences = [] } = parsedTsconfig(configFile);
  const base = options.pathsBasePath ?? options.baseUrl ?? path.dirname(configFile);
  const mapped = Object.values(options.paths ?? {})
    .flat()
    .map((target) => directoryOf(path.resolve(base, target)));
  const referenced = projectReferences.map((reference) => directoryOf(reference.path));
  return [...mapped, ...referenced].filter(
    (directory) =>
      directory !== undefined && !directory.split(path.sep).includes(DEPENDENCY_FOLDER),
  );
}

export function typecheckProgramRoots(projectRoot) {
  const root = path.resolve(projectRoot);
  const configFile = path.join(root, PROJECT_TSCONFIG);
  if (!existsSync(configFile)) {
    return [root];
  }
  try {
    return outermost([root, ...reachedDirectories(configFile)]);
  } catch {
    return [root];
  }
}
