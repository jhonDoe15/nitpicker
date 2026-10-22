import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SPRING_ARCH_REPORT } from '../spring-arch/spring-arch.mjs';

export const SPRING_LAYER_PACKAGES = [
  'controller',
  'controllers',
  'service',
  'services',
  'repository',
  'repositories',
  'entity',
  'entities',
  'model',
  'models',
  'dto',
  'dtos',
  'dao',
  'daos',
  'util',
  'utils',
  'common',
  'web',
  'api',
  'rest',
  'resource',
  'resources',
  'persistence',
  'domain',
  'mapper',
  'mappers',
  'exception',
  'exceptions',
  'adapter',
  'adapters',
  'application',
  'infrastructure',
  'infra',
  'port',
  'ports',
  'usecase',
  'usecases',
  'helper',
  'helpers',
];
const SHARED_PACKAGE = 'shared';
const ARCHUNIT_EDGE_RULES = new Set(['spring-feature-boundary', 'spring-shared-pure']);
const GLOB_CHARACTERS = /[\\*?{}[\]]/gu;

export function readSpringReports(projects) {
  return projects.flatMap((project) => {
    const file = path.join(project.reportRoot, SPRING_ARCH_REPORT);
    if (!existsSync(file)) {
      return [];
    }
    const { root, violations } = JSON.parse(readFileSync(file, 'utf8'));
    return [{ qualifier: project.qualifier, root, violations }];
  });
}

function rootFolder(root, { packageName, file }) {
  const suffix = packageName.slice(root.length).replaceAll('.', '/');
  const folder = path.posix.dirname(file);
  return folder.endsWith(suffix) && (packageName === root || packageName.startsWith(`${root}.`))
    ? [folder.slice(0, folder.length - suffix.length)]
    : [];
}

export function springRootFolders(roots, classes) {
  return [
    ...new Set(roots.flatMap((root) => classes.flatMap((entry) => rootFolder(root, entry)))),
  ].sort();
}

function literalGlob(folder) {
  return folder.replaceAll(GLOB_CHARACTERS, (character) => `\\${character}`);
}

function springLayout(folders, layout) {
  const globs = folders.map(literalGlob);
  return {
    featureRoots: globs,
    sharedRoots: layout.sharedRoots ?? globs.map((glob) => `${glob}/${SHARED_PACKAGE}`),
    notFeatures: [SHARED_PACKAGE, ...SPRING_LAYER_PACKAGES],
  };
}

function coveredEdges(reports, resolve) {
  return new Set(
    reports.flatMap(({ qualifier, violations }) =>
      violations
        .filter(({ rule, detail }) => ARCHUNIT_EDGE_RULES.has(rule) && detail !== '')
        .flatMap(({ className, detail }) => {
          const from = resolve(qualifier, className)?.file;
          const to = resolve(qualifier, detail)?.file;
          return from === undefined || to === undefined ? [] : [`${from}\0${to}`];
        }),
    ),
  );
}

export function featurePlan(layout, reports, graph) {
  const roots = reports.map(({ root }) => root).filter((root) => typeof root === 'string');
  const folders = layout.featureRoots === undefined ? springRootFolders(roots, graph.classes) : [];
  if (folders.length > 0) {
    return { layout: springLayout(folders, layout), boundaries: false, covered: new Set() };
  }
  const { sharedRoots, featureRoots } = layout;
  return {
    layout: {
      ...(sharedRoots === undefined ? {} : { sharedRoots }),
      ...(featureRoots === undefined ? {} : { featureRoots }),
    },
    boundaries: true,
    covered: coveredEdges(reports, graph.resolve),
  };
}
