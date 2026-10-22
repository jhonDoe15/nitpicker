import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { kotlinModules, readKotlinMetrics } from '../kotlin/kotlin-metrics.mjs';
import { outerClass, parseJdeps } from '../metrics/java-coupling.mjs';
import { readDeclarations } from '../review-rules/source-declarations.mjs';

const MAIN_EDGES = 'jdeps.txt';
const MAIN_CLASSES = 'jdeps-classes.txt';

function packageOf(className) {
  const index = className.lastIndexOf('.');
  return index < 0 ? '' : className.slice(0, index);
}

function reportFiles({ reportRoot }) {
  return {
    edges: path.join(reportRoot, MAIN_EDGES),
    classes: path.join(reportRoot, MAIN_CLASSES),
  };
}

function isComplete(project) {
  return Object.values(reportFiles(project)).every((file) => existsSync(file));
}

function keyOf(qualifier, name) {
  return `${qualifier}\0${name}`;
}

function sourceFileReader(projectRoot, project) {
  const kotlin = kotlinModules(readKotlinMetrics(project.reportRoot));
  const declared = readDeclarations(projectRoot, [
    ...project.sourceRoots,
    ...(project.kotlinSourceRoots ?? []),
  ]);
  return (name) => kotlin.fileOf.get(kotlin.moduleOf.get(name)) ?? declared.get(name)?.file;
}

function readProject(projectRoot, project) {
  const names = [
    ...new Set(
      readFileSync(reportFiles(project).classes, 'utf8')
        .split(/\r?\n/u)
        .filter(Boolean)
        .map(outerClass),
    ),
  ];
  const fileOf = sourceFileReader(projectRoot, project);
  const classes = names.flatMap((name) => {
    const file = fileOf(name);
    return file === undefined
      ? []
      : [{ name, file, packageName: packageOf(name), qualifier: project.qualifier }];
  });
  return { project, names, classes };
}

function ownersOf(read) {
  const owners = new Map();
  for (const { project, names } of read) {
    for (const name of names) {
      owners.set(name, [...(owners.get(name) ?? []), project.qualifier]);
    }
  }
  return owners;
}

function classResolver(read) {
  const owners = ownersOf(read);
  const located = new Map(
    read.flatMap(({ classes }) =>
      classes.map((entry) => [keyOf(entry.qualifier, entry.name), entry]),
    ),
  );
  return {
    isProjectClass: (name) => owners.has(outerClass(name)),
    resolve: (qualifier, name) => {
      const outer = outerClass(name);
      const found = owners.get(outer) ?? [];
      const owner = found.includes(qualifier) || found.length !== 1 ? qualifier : found[0];
      return located.get(keyOf(owner, outer));
    },
  };
}

function projectEdges(project, resolver) {
  return parseJdeps(readFileSync(reportFiles(project).edges, 'utf8')).flatMap((edge) => {
    const source = resolver.resolve(project.qualifier, edge.source);
    if (source === undefined) {
      return [];
    }
    if (!resolver.isProjectClass(edge.target)) {
      return [{ source, library: edge.target }];
    }
    const target = resolver.resolve(project.qualifier, edge.target);
    return target === undefined || target === source ? [] : [{ source, target }];
  });
}

function unique(edges, keyOfEdge) {
  return [...new Map(edges.map((edge) => [keyOfEdge(edge), edge])).values()];
}

export function readClassGraph(projectRoot, projects) {
  const read = projects.filter(isComplete).map((project) => readProject(projectRoot, project));
  const resolver = classResolver(read);
  const edges = read.flatMap(({ project }) => projectEdges(project, resolver));
  return {
    classes: read.flatMap(({ classes }) => classes),
    resolve: resolver.resolve,
    edges: unique(
      edges.filter(({ target }) => target !== undefined),
      ({ source, target }) => `${source.file}\0${source.name}\0${target.file}\0${target.name}`,
    ),
    libraryEdges: unique(
      edges.filter(({ library }) => library !== undefined),
      ({ source, library }) => `${source.file}\0${source.name}\0${library}`,
    ),
  };
}
