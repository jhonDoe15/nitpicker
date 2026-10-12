import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCouplingReport, evaluateCoupling } from '../../../shared/rules/coupling.mjs';

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

function packageOf(className) {
  const index = className.lastIndexOf('.');
  return index < 0 ? ROOT_PACKAGE : className.slice(0, index);
}

export function analyzeJavaCoupling({ classes, edges, fileOf }) {
  return buildCouplingReport({
    modules: [...new Set(classes.map(outerClass))].sort(),
    edges: edges.map((edge) => ({
      source: outerClass(edge.source),
      target: outerClass(edge.target),
    })),
    packageOf,
    fileOf,
  });
}

export function readCouplingFindings(reportRoot, { projectRoot, sourceRoots }) {
  const jdeps = path.join(reportRoot, JDEPS_REPORT);
  const classList = path.join(reportRoot, JDEPS_CLASSES);
  if (!existsSync(jdeps) || !existsSync(classList)) {
    return [];
  }
  const classes = readFileSync(classList, 'utf8').split(/\r?\n/).filter(Boolean);
  function fileOf(className) {
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
  });
  return evaluateCoupling(report, COUPLING_TOOL);
}
