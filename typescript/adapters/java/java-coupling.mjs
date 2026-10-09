import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { computeCoupling, evaluateCoupling } from '../../shared/rules/coupling.mjs';

// Coupling and stability for the Java preset. The init script runs `jdeps -verbose:class
// -filter:none` over the compiled main classes (build/nitpicker/jdeps.txt) and lists those classes
// (build/nitpicker/jdeps-classes.txt, one binary class name per line). This module turns the class
// graph into the neutral `CouplingReport` of shared/rules/coupling.mjs and runs the shared rule, so
// the findings (ids, messages, metrics) are the TypeScript ones.
//
// How the TypeScript semantics map to Java:
//  - module = a source file: a top-level class with its nested classes (`a.B$C` belongs to `a.B`);
//  - package = a Java package (the TypeScript preset uses the top-level directory under the source
//    root; Java packages are flat, so `a.b` and `a.b.c` are two packages); the default package is
//    named `(root)`, as TypeScript names files directly under the source root;
//  - an edge is a distinct (source file, target file) pair between two main-source files; edges to
//    the JDK, libraries or test classes are not part of the graph, and neither are self edges;
//  - module fan-in/out count distinct files; package fan-in/out count distinct files outside the
//    package that depend on it / that it depends on; instability = fanOut / (fanIn + fanOut);
//  - a `stability-direction` edge is a package pair with source instability below target
//    instability, deduplicated per package pair, largest delta first.
// Not reported for Java: the runtime-only variants (jdeps cannot tell type-only from runtime
// references) and the runtime/type-only dependency summaries.

export const COUPLING_TOOL = 'coupling';
export const JDEPS_REPORT = 'jdeps.txt';
export const JDEPS_CLASSES = 'jdeps-classes.txt';
const ROOT_PACKAGE = '(root)';

/** `{ source, target }` class-name pairs from `jdeps -verbose:class` text output. */
export function parseJdeps(text) {
  const edges = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+->\s+(\S+)(?:\s|$)/.exec(line);
    if (match !== null) {
      edges.push({ source: match[1], target: match[2] });
    }
  }
  return edges;
}

const outerClass = (className) => className.split('$')[0];

function packageOf(className) {
  const index = className.lastIndexOf('.');
  return index < 0 ? ROOT_PACKAGE : className.slice(0, index);
}

/**
 * The neutral coupling report of a class graph. `classes` are the binary names of all main classes;
 * `fileOf` maps an outermost class name to its project-relative source file.
 */
export function analyzeJavaCoupling({ classes, edges, fileOf }) {
  const modules = [...new Set(classes.map(outerClass))].sort();
  const moduleSet = new Set(modules);
  const edgeKeys = new Set();
  const moduleEdges = [];
  for (const edge of edges) {
    const source = outerClass(edge.source);
    const target = outerClass(edge.target);
    const key = `${source}\0${target}`;
    if (source !== target && moduleSet.has(source) && moduleSet.has(target) && !edgeKeys.has(key)) {
      edgeKeys.add(key);
      moduleEdges.push({ source, target });
    }
  }

  const metrics = computeCoupling({ modules, edges: moduleEdges, packageOf });
  // Java packages are listed in code-unit order, modules by file.
  const packages = metrics.packages.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

  return {
    summary: {
      modules: modules.length,
      dependencies: moduleEdges.length,
      packages: packages.length,
    },
    modules: metrics.modules.map(({ module, fanIn, fanOut, totalCoupling, instability }) => ({
      file: fileOf(module),
      fanIn,
      fanOut,
      totalCoupling,
      instability,
    })),
    packages,
    stabilityDirection: metrics.stabilityDirection.map(({ source, target, delta }) => ({
      source,
      target,
      delta,
    })),
  };
}

/**
 * The coupling findings of `build/nitpicker/jdeps*.txt`, or none when the reports are absent (a
 * project without main classes). A file's path is its source file below one of `sourceRoots`; a
 * class that sits in a differently named file (a second top-level class) is attributed to
 * `<package>/<Class>.java` under the first source root.
 */
export function readCouplingFindings(reportRoot, { projectRoot, sourceRoots }) {
  const jdeps = path.join(reportRoot, JDEPS_REPORT);
  const classList = path.join(reportRoot, JDEPS_CLASSES);
  if (!existsSync(jdeps) || !existsSync(classList)) {
    return [];
  }
  const classes = readFileSync(classList, 'utf8').split(/\r?\n/).filter(Boolean);
  const fileOf = (className) => {
    const relative = `${className.replaceAll('.', '/')}.java`;
    const candidates = sourceRoots.map((root) => `${root}/${relative}`);
    return (
      candidates.find((candidate) => existsSync(path.join(projectRoot, candidate))) ??
      candidates[0] ??
      relative
    );
  };
  const report = analyzeJavaCoupling({
    classes,
    edges: parseJdeps(readFileSync(jdeps, 'utf8')),
    fileOf,
  });
  return evaluateCoupling(report, COUPLING_TOOL);
}
