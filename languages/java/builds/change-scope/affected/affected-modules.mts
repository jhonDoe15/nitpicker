const SOURCE_ROOT = /^src\//u;
const ROOT = '.';

export type JavaModule = {
  readonly dir: string;
  readonly hasSources: boolean;
  readonly requires: readonly string[];
};

function ownerOf(file: string, modules: readonly JavaModule[]): JavaModule | undefined {
  const inside = modules
    .filter((module) => module.dir !== ROOT && file.startsWith(`${module.dir}/`))
    .sort((left, right) => right.dir.length - left.dir.length);
  if (inside.length > 0) {
    return inside[0];
  }
  const root = modules.find((module) => module.dir === ROOT);
  return root?.hasSources === true && SOURCE_ROOT.test(file) ? root : undefined;
}

function dependentsOf(modules: readonly JavaModule[]): Map<string, string[]> {
  const dependents = new Map<string, string[]>(modules.map((module) => [module.dir, []]));
  for (const module of modules) {
    for (const required of module.requires) {
      dependents.get(required)?.push(module.dir);
    }
  }
  return dependents;
}

export function affectedModules({
  modules,
  changedFiles,
}: {
  readonly modules: readonly JavaModule[];
  readonly changedFiles: readonly string[] | undefined;
}): Set<string> | undefined {
  if (changedFiles === undefined || changedFiles.length === 0) {
    return undefined;
  }
  const owners = changedFiles.map((file) => ownerOf(file, modules));
  const dirs: string[] = [];
  for (const owner of owners) {
    if (owner === undefined) {
      return undefined;
    }
    dirs.push(owner.dir);
  }
  const dependents = dependentsOf(modules);
  const affected = new Set(dirs);
  for (const dir of affected) {
    for (const dependent of dependents.get(dir) ?? []) {
      affected.add(dependent);
    }
  }
  return affected;
}
