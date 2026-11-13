const SOURCE_ROOT = /^src\//u;
const ROOT = '.';

function ownerOf(file, modules) {
  const inside = modules
    .filter((module) => module.dir !== ROOT && file.startsWith(`${module.dir}/`))
    .sort((left, right) => right.dir.length - left.dir.length);
  if (inside.length > 0) {
    return inside[0];
  }
  const root = modules.find((module) => module.dir === ROOT);
  return root?.hasSources === true && SOURCE_ROOT.test(file) ? root : undefined;
}

function dependentsOf(modules) {
  const dependents = new Map(modules.map((module) => [module.dir, []]));
  for (const module of modules) {
    for (const required of module.requires) {
      dependents.get(required)?.push(module.dir);
    }
  }
  return dependents;
}

export function affectedModules({ modules, changedFiles }) {
  if (changedFiles === undefined || changedFiles.length === 0) {
    return undefined;
  }
  const owners = changedFiles.map((file) => ownerOf(file, modules));
  if (owners.includes(undefined)) {
    return undefined;
  }
  const dependents = dependentsOf(modules);
  const affected = new Set(owners.map((owner) => owner.dir));
  for (const dir of affected) {
    for (const dependent of dependents.get(dir) ?? []) {
      affected.add(dependent);
    }
  }
  return affected;
}
