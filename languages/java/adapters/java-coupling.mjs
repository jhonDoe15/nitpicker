import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { computeCoupling, evaluateCoupling } from '../../../shared/rules/coupling.mjs';

const COUPLING_TOOL = 'coupling';
const JDEPS_REPORT = 'jdeps.txt';
const JDEPS_CLASSES = 'jdeps-classes.txt';
const ROOT_PACKAGE = '(root)';

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

function outerClass(className) {
  return className.split('$')[0];
}

function byName(left, right) {
  if (left.name < right.name) {
    return -1;
  }
  return left.name > right.name ? 1 : 0;
}

function packageOf(className) {
  const index = className.lastIndexOf('.');
  return index < 0 ? ROOT_PACKAGE : className.slice(0, index);
}

export function analyzeJavaCoupling({ classes, edges, fileOf, moduleOf = outerClass }) {
  const modules = [...new Set(classes.map(moduleOf))].sort();
  const moduleSet = new Set(modules);
  const edgeKeys = new Set();
  const moduleEdges = [];
  for (const edge of edges) {
    const source = moduleOf(edge.source);
    const target = moduleOf(edge.target);
    const key = `${source}\0${target}`;
    if (source !== target && moduleSet.has(source) && moduleSet.has(target) && !edgeKeys.has(key)) {
      edgeKeys.add(key);
      moduleEdges.push({ source, target });
    }
  }

  const metrics = computeCoupling({ modules, edges: moduleEdges, packageOf });
  const packages = metrics.packages.sort(byName);

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

export function readCouplingFindings(reportRoot, { projectRoot, sourceRoots, kotlin }) {
  const jdeps = path.join(reportRoot, JDEPS_REPORT);
  const classList = path.join(reportRoot, JDEPS_CLASSES);
  if (!existsSync(jdeps) || !existsSync(classList)) {
    return [];
  }
  const classes = readFileSync(classList, 'utf8').split(/\r?\n/).filter(Boolean);
  function fileOf(className) {
    const known = kotlin?.fileOf.get(className);
    if (known !== undefined) {
      return known;
    }
    const relative = `${className.replaceAll('.', '/')}.java`;
    const candidates = sourceRoots.map((root) => `${root}/${relative}`);
    return (
      candidates.find((candidate) => existsSync(path.join(projectRoot, candidate))) ??
      candidates[0] ??
      relative
    );
  }
  const report = analyzeJavaCoupling({
    classes,
    edges: parseJdeps(readFileSync(jdeps, 'utf8')),
    fileOf,
    moduleOf: (className) => {
      const outer = outerClass(className);
      return kotlin?.moduleOf.get(outer) ?? outer;
    },
  });
  return evaluateCoupling(report, COUPLING_TOOL);
}
