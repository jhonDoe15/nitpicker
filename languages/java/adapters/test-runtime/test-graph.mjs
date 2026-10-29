import { readFileSync } from 'node:fs';
import { outerClass, parseJdeps } from '../metrics/java-coupling.mjs';
import { pathInside } from '../review-rules/java-sources.mjs';
import { ownersOf, resolver } from '../review-rules/test-only-classes.mjs';
import { EDGE_KINDS } from '../../../../shared/rules/test-runtime/classify.mjs';
import { isFrameworkBridge, isTestMarker } from './test-markers.mjs';

function readProject(project) {
  function report(name) {
    return readFileSync(pathInside(project.reportRoot, name), 'utf8');
  }
  return {
    ...project,
    classes: report('jdeps-classes.txt').split(/\r?\n/u).filter(Boolean),
    testEdges: parseJdeps(report('jdeps-test.txt')),
  };
}

function addTo(map, key, value) {
  map.set(key, (map.get(key) ?? new Set()).add(value));
}

function nodeOf(qualifier, className) {
  return `${qualifier}\0${outerClass(className)}`;
}

function resolvers(read) {
  const testClasses = read.map(({ qualifier, testEdges }) => ({
    qualifier,
    classes: testEdges.map(({ source }) => source),
  }));
  const production = resolver(ownersOf(read));
  const tests = resolver(ownersOf(testClasses));
  return (target, qualifier) => production(target, qualifier) ?? tests(target, qualifier);
}

function collectEdges(read) {
  const resolve = resolvers(read);
  const collected = { reached: new Map(), bridges: new Map(), declaring: new Set() };
  function record(qualifier, { source, target }) {
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

export function readTestGraph(projects) {
  const read = projects.map(readProject);
  const { reached, bridges, declaring } = collectEdges(read);
  const productionNodes = new Set(
    read.flatMap(({ qualifier, classes }) => classes.map((name) => nodeOf(qualifier, name))),
  );
  return {
    edges: new Map(
      [...reached].map(([from, targets]) => [
        from,
        [...targets].map((target) => ({ target, kind: EDGE_KINDS.RUNTIME })),
      ]),
    ),
    declaring,
    isProduction: (node) => productionNodes.has(node),
    bridgesOf: (test, visited) =>
      [...new Set([test, ...visited].flatMap((node) => [...(bridges.get(node) ?? [])]))].toSorted(),
  };
}
