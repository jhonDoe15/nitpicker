import path from 'node:path';
import { affectedModules } from '../../builds/change-scope/affected/affected-modules.mjs';

function posix(from, to) {
  return path.relative(from, to).replaceAll('\\', '/') || '.';
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

export function mavenScope({ modules, projectRoot, changedFiles }) {
  const affected = affectedModules({ modules: graphOf(modules, projectRoot), changedFiles });
  const picked =
    affected === undefined
      ? modules
      : modules.filter((module) => affected.has(posix(projectRoot, module.basedir)));
  const reported = picked.some((module) => module.packaging !== 'pom') ? picked : modules;
  const names = (list) => list.map((module) => posix(projectRoot, module.basedir));
  return {
    reported,
    notAffected: names(
      modules.filter((module) => !reported.includes(module) && module.packaging !== 'pom'),
    ),
    selection:
      reported.length === modules.length
        ? []
        : ['-pl', reported.map((module) => posix(projectRoot, module.basedir)).join(','), '-am'],
  };
}
