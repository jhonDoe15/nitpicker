import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { affectedModules as untypedAffectedModules } from '../../builds/change-scope/affected/affected-modules.mts';

type ScopeModule = {
  readonly coordinates: string;
  readonly basedir: string;
  readonly packaging: string;
  readonly requires: readonly string[];
};
type GraphModule = {
  readonly dir: string;
  readonly hasSources: boolean;
  readonly requires: readonly string[];
};
type ScopeRequest<T extends ScopeModule> = {
  readonly modules: readonly T[];
  readonly projectRoot: string;
  readonly mavenRoot: string;
  readonly changedFiles: readonly string[] | undefined;
};
type Scope<T> = {
  readonly reported: readonly T[];
  readonly notAffected: string[];
  readonly selection: string[];
};

const affectedModules: (options: {
  readonly modules: readonly GraphModule[];
  readonly changedFiles: readonly string[] | undefined;
}) => ReadonlySet<string> | undefined = untypedAffectedModules;

function posix(from: string, to: string): string {
  return path.relative(from, to).replaceAll('\\', '/') || '.';
}

function real(directory: string): string {
  return existsSync(directory) ? realpathSync.native(directory) : directory;
}

export function isInside(root: string, directory: string): boolean {
  const relative = path.relative(real(root), real(directory));
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function graphOf(modules: readonly ScopeModule[], projectRoot: string): GraphModule[] {
  const dirs = new Map(
    modules.map((module) => [module.coordinates, posix(projectRoot, module.basedir)]),
  );
  return modules.map((module) => ({
    dir: posix(projectRoot, module.basedir),
    hasSources: module.packaging !== 'pom',
    requires: module.requires.flatMap((coordinates) => {
      const dir = dirs.get(coordinates);
      return dir === undefined || dir === '' ? [] : [dir];
    }),
  }));
}

export function mavenScope<T extends ScopeModule>({
  modules,
  projectRoot,
  mavenRoot,
  changedFiles,
}: ScopeRequest<T>): Scope<T> {
  const own = modules.filter((module) => isInside(projectRoot, module.basedir));
  const affected = affectedModules({ modules: graphOf(modules, projectRoot), changedFiles });
  const picked =
    affected === undefined
      ? own
      : own.filter((module) => affected.has(posix(projectRoot, module.basedir)));
  const reported = picked.some((module) => module.packaging !== 'pom') ? picked : own;
  return {
    reported,
    notAffected: own
      .filter((module) => !reported.includes(module) && module.packaging !== 'pom')
      .map((module) => posix(projectRoot, module.basedir)),
    selection:
      reported.length === modules.length
        ? []
        : ['-pl', reported.map((module) => posix(mavenRoot, module.basedir)).join(','), '-am'],
  };
}
