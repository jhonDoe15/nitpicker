import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_TSCONFIG, parsedTsconfig } from '../tsconfig-files.mts';

const DEPENDENCY_FOLDER = 'node_modules';

function directoryOf(target: string): string | undefined {
  const literal = target.includes('*') ? target.slice(0, target.indexOf('*')) : target;
  const whole = literal.endsWith('/') || literal.endsWith(path.sep);
  const candidate = whole || literal === target ? literal : path.dirname(literal);
  if (!existsSync(candidate)) {
    return undefined;
  }
  return statSync(candidate).isDirectory() ? path.resolve(candidate) : path.dirname(candidate);
}

function pathsBaseOf(options: Readonly<Record<string, unknown>>): string | undefined {
  const base = options['pathsBasePath'] ?? options['baseUrl'];
  return typeof base === 'string' ? base : undefined;
}

function isInside(directory: string, root: string): boolean {
  const relative = path.relative(root, directory);
  return relative === '' || !(relative.startsWith('..') || path.isAbsolute(relative));
}

function outermost(directories: readonly string[]): string[] {
  const unique = [...new Set(directories)];
  return unique.filter(
    (directory) => !unique.some((other) => other !== directory && isInside(directory, other)),
  );
}

function reachedDirectories(configFile: string): string[] {
  const { options, projectReferences = [] } = parsedTsconfig(configFile);
  const base = pathsBaseOf(options) ?? path.dirname(configFile);
  const mapped = Object.values(options.paths ?? {})
    .flat()
    .map((target) => directoryOf(path.resolve(base, target)));
  const referenced = projectReferences.map((reference) => directoryOf(reference.path));
  return [...mapped, ...referenced].filter(
    (directory): directory is string =>
      directory !== undefined && !directory.split(path.sep).includes(DEPENDENCY_FOLDER),
  );
}

export function typecheckProgramRoots(projectRoot: string): string[] {
  const root = path.resolve(projectRoot);
  const configFile = path.join(root, PROJECT_TSCONFIG);
  if (!existsSync(configFile)) {
    return [root];
  }
  return outermost([root, ...reachedDirectories(configFile)]);
}
