import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { inModule as inModuleUntyped } from '../../builds/module-path.mts';
import {
  kotlinModules as kotlinModulesUntyped,
  readKotlinMetrics as readKotlinMetricsUntyped,
} from '../kotlin/kotlin-metrics.mts';
import { outerClass as outerClassUntyped } from '../../ingest/class-names.mts';
import { parseJdeps } from '../metrics/java-coupling.mts';
import type { Metrics } from '../kotlin/kotlin-metrics.mts';
import type { KotlinModules } from '../metrics/java-coupling-types.mts';
import { readDeclarations as readDeclarationsUntyped } from '../review-rules/source-declarations.mts';
import type {
  ClassEdge,
  ClassEntry,
  ClassProject,
  ClassResolver,
  LibraryEdge,
  ResolvedGraph,
} from '../domain/domain-types.mts';

type ProjectRead = {
  readonly project: ClassProject;
  readonly names: string[];
  readonly classes: ClassEntry[];
};

const inModule: (modulePath: string | undefined, relativePath: string) => string = inModuleUntyped;
const readKotlinMetrics: (reportRoot: string) => Metrics = readKotlinMetricsUntyped;
const kotlinModules: (metrics: Metrics) => KotlinModules = kotlinModulesUntyped;
const outerClass: (className: string) => string = outerClassUntyped;
const readDeclarations: (
  projectRoot: string,
  roots: readonly string[],
) => ReadonlyMap<string, { readonly file: string }> = readDeclarationsUntyped;

const MAIN_EDGES = 'jdeps.txt';
const MAIN_CLASSES = 'jdeps-classes.txt';

function packageOf(className: string): string {
  const index = className.lastIndexOf('.');
  return index < 0 ? '' : className.slice(0, index);
}

function reportFiles({ reportRoot }: ClassProject): { edges: string; classes: string } {
  return {
    edges: path.join(reportRoot, MAIN_EDGES),
    classes: path.join(reportRoot, MAIN_CLASSES),
  };
}

function isComplete(project: ClassProject): boolean {
  return Object.values(reportFiles(project)).every((file) => existsSync(file));
}

function keyOf(qualifier: string, name: string): string {
  return `${qualifier}\0${name}`;
}

function isInside(projectRoot: string, root: string): boolean {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, root);
  return full === base || full.startsWith(base + path.sep);
}

function sourceFileReader(
  projectRoot: string,
  project: ClassProject,
): (name: string) => string | undefined {
  const kotlin = kotlinModules(readKotlinMetrics(project.reportRoot));
  const declared = readDeclarations(
    projectRoot,
    [...project.sourceRoots, ...(project.kotlinSourceRoots ?? [])].filter((root) =>
      isInside(projectRoot, root),
    ),
  );
  return (name) => {
    const module = kotlin.moduleOf.get(name);
    const file = module === undefined ? undefined : kotlin.fileOf.get(module);
    return file === undefined ? declared.get(name)?.file : inModule(project.filePrefix, file);
  };
}

function readProject(projectRoot: string, project: ClassProject): ProjectRead {
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

function ownersOf(read: readonly ProjectRead[]): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const { project, names } of read) {
    for (const name of names) {
      owners.set(name, [...(owners.get(name) ?? []), project.qualifier]);
    }
  }
  return owners;
}

function classResolver(read: readonly ProjectRead[]): ClassResolver {
  const owners = ownersOf(read);
  const located = new Map<string, ClassEntry>(
    read.flatMap(({ classes }) =>
      classes.map((entry) => [keyOf(entry.qualifier, entry.name), entry]),
    ),
  );
  return {
    isProjectClass: (name) => owners.has(outerClass(name)),
    resolve: (qualifier, name) => {
      const outer = outerClass(name);
      const found = owners.get(outer) ?? [];
      const owner =
        found.includes(qualifier) || found.length !== 1 ? qualifier : (found[0] ?? qualifier);
      return located.get(keyOf(owner, outer));
    },
  };
}

function projectEdges(project: ClassProject, resolver: ClassResolver): (ClassEdge | LibraryEdge)[] {
  return parseJdeps(readFileSync(reportFiles(project).edges, 'utf8')).flatMap<
    ClassEdge | LibraryEdge
  >((edge) => {
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

function unique<Edge>(edges: readonly Edge[], keyOfEdge: (edge: Edge) => string): Edge[] {
  return [...new Map(edges.map((edge) => [keyOfEdge(edge), edge])).values()];
}

export function readClassGraph(
  projectRoot: string,
  projects: readonly ClassProject[],
): ResolvedGraph {
  const read = projects.filter(isComplete).map((project) => readProject(projectRoot, project));
  const resolver = classResolver(read);
  const edges = read.flatMap(({ project }) => projectEdges(project, resolver));
  return {
    classes: read.flatMap(({ classes }) => classes),
    resolve: resolver.resolve,
    edges: unique(
      edges.filter((edge) => 'target' in edge),
      ({ source, target }) => `${source.file}\0${source.name}\0${target.file}\0${target.name}`,
    ),
    libraryEdges: unique(
      edges.filter((edge) => 'library' in edge),
      ({ source, library }) => `${source.file}\0${source.name}\0${library}`,
    ),
  };
}
