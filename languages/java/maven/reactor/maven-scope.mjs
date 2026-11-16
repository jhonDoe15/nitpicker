import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { affectedModules } from '../../builds/change-scope/affected/affected-modules.mjs';

function posix(from, to) {
  return path.relative(from, to).replaceAll('\\', '/') || '.';
}

function real(directory) {
  return existsSync(directory) ? realpathSync.native(directory) : directory;
}

export function isInside(root, directory) {
  const relative = path.relative(real(root), real(directory));
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function graphOf(modules, projectRoot) {
  const dirs = new Map(
    modules.map((module) => [module.coordinates, posix(projectRoot, module.basedir)]),
  );
  return modules.map((module) => ({
    dir: posix(projectRoot, module.basedir),
    hasSources: module.packaging !== 'pom',
    requires: module.requires.map((coordinates) => dirs.get(coordinates)).filter(Boolean),
  }));
}

export function mavenScope({ modules, projectRoot, mavenRoot, changedFiles }) {
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
