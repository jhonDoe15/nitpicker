import { readFileSync } from 'node:fs';
import { outerClass as untypedOuterClass } from '../../ingest/class-names.mts';
import { parseJdeps } from '../metrics/java-coupling.mts';
import { pathInside as untypedPathInside } from '../review-rules/java-sources.mts';
import { ownersOf, resolver } from '../review-rules/test-only/test-only-classes.mts';
import { EDGE_KINDS } from '../../../../shared/rules/test-runtime/classify.mjs';
import {
  isFrameworkBridge as untypedIsFrameworkBridge,
  isTestMarker as untypedIsTestMarker,
} from './test-markers.mts';

export type TestProject = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly testSourceRoots?: readonly string[] | undefined;
  readonly kotlinTestSourceRoots?: readonly string[] | undefined;
};
type ReadProject = TestProject & {
  readonly classes: string[];
  readonly testEdges: { source: string; target: string }[];
};
type TestGraph = {
  readonly edges: Map<string, { target: string; kind: string }[]>;
  readonly declaring: Set<string>;
  readonly isProduction: (node: string) => boolean;
  readonly bridgesOf: (test: string, visited: Iterable<string>) => string[];
};

const outerClass: (className: string) => string = untypedOuterClass;
const pathInside: (root: string, file: string) => string = untypedPathInside;
const isTestMarker: (className: string) => boolean = untypedIsTestMarker;
const isFrameworkBridge: (className: string) => boolean = untypedIsFrameworkBridge;

function readProject(project: TestProject): ReadProject {
  function report(name: string): string {
    return readFileSync(pathInside(project.reportRoot, name), 'utf8');
  }
  return {
    ...project,
    classes: report('jdeps-classes.txt').split(/\r?\n/u).filter(Boolean),
    testEdges: parseJdeps(report('jdeps-test.txt')),
  };
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  map.set(key, (map.get(key) ?? new Set<string>()).add(value));
}

function nodeOf(qualifier: string, className: string): string {
  return `${qualifier}\0${outerClass(className)}`;
}

function resolvers(
  read: readonly ReadProject[],
): (target: string, qualifier: string) => string | undefined {
  const testClasses = read.map(({ qualifier, testEdges }) => ({
    qualifier,
    classes: testEdges.map(({ source }) => source),
    mainEdges: [],
  }));
  const production = resolver(ownersOf(read.map((project) => ({ ...project, mainEdges: [] }))));
  const tests = resolver(ownersOf(testClasses));
  return (target: string, qualifier: string) =>
    production(target, qualifier) ?? tests(target, qualifier);
}

function collectEdges(read: readonly ReadProject[]): {
  reached: Map<string, Set<string>>;
  bridges: Map<string, Set<string>>;
  declaring: Set<string>;
} {
  const resolve = resolvers(read);
  const collected = {
    reached: new Map<string, Set<string>>(),
    bridges: new Map<string, Set<string>>(),
    declaring: new Set<string>(),
  };
  function record(qualifier: string, { source, target }: { source: string; target: string }): void {
    const from = nodeOf(qualifier, source);
    const to = resolve(target, qualifier);
    if (isTestMarker(target)) {
      collected.declaring.add(from);
    }
    if (isFrameworkBridge(target)) {
      addTo(collected.bridges, from, target);
    }
    if (to !== undefined && to !== from) {
      addTo(collected.reached, from, to);
    }
  }
  for (const { qualifier, testEdges } of read) {
    for (const edge of testEdges) {
      record(qualifier, edge);
    }
  }
  return collected;
}

export function readTestGraph(projects: readonly TestProject[]): TestGraph {
  const read = projects.map(readProject);
  const { reached, bridges, declaring } = collectEdges(read);
  const productionNodes = new Set(
    read.flatMap(({ qualifier, classes }) => classes.map((name) => nodeOf(qualifier, name))),
  );
  return {
    edges: new Map(
      [...reached].map(([from, targets]): [string, { target: string; kind: string }[]] => [
        from,
        [...targets].map((target) => ({ target, kind: EDGE_KINDS.RUNTIME })),
      ]),
    ),
    declaring,
    isProduction: (node: string) => productionNodes.has(node),
    bridgesOf: (test: string, visited: Iterable<string>) =>
      [...new Set([test, ...visited].flatMap((node) => [...(bridges.get(node) ?? [])]))].toSorted(),
  };
}
