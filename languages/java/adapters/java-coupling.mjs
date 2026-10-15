import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCouplingReport, evaluateCoupling } from '../../../shared/rules/coupling.mjs';
import { cycleFindings } from '../guards/cycles.mjs';

const COUPLING_TOOL = 'coupling';
const JDEPS_REPORT = 'jdeps.txt';
const JDEPS_CLASSES = 'jdeps-classes.txt';
const PERMITS_REPORT = 'permits.txt';
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

export function analyzeJavaCoupling({ classes, edges, fileOf, moduleOf = outerClass }) {
  return buildCouplingReport({
    modules: [...new Set(classes.map(moduleOf))].sort(),
    edges: edges.map((edge) => ({
      source: moduleOf(edge.source),
      target: moduleOf(edge.target),
    })),
    packageOf,
    fileOf,
  });
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
  function moduleOf(className) {
    const outer = outerClass(className);
    return kotlin?.moduleOf.get(outer) ?? outer;
  }
  const edges = parseJdeps(readFileSync(jdeps, 'utf8'));
  const report = analyzeJavaCoupling({ classes, edges, fileOf, moduleOf });
  return [
    ...evaluateCoupling(report, COUPLING_TOOL),
    ...packageCycles({ reportRoot, classes, edges, moduleOf, fileOf }),
  ];
}

function permittedEdges(reportRoot) {
  const permits = path.join(reportRoot, PERMITS_REPORT);
  return new Set(
    existsSync(permits)
      ? parseJdeps(
          readFileSync(permits, 'utf8')
            .split(/\r?\n/)
            .map((line) => `  ${line}`)
            .join('\n'),
        ).map((edge) => `${edge.source}\0${edge.target}`)
      : [],
  );
}

function packageCycles({ reportRoot, classes, edges, moduleOf, fileOf }) {
  const permitted = permittedEdges(reportRoot);
  return cycleFindings(
    {
      modules: [...new Set(classes.map(moduleOf))],
      edges: edges
        .filter((edge) => !permitted.has(`${edge.source}\0${edge.target}`))
        .map((edge) => ({ source: moduleOf(edge.source), target: moduleOf(edge.target) })),
      packageOf,
      fileOf,
    },
    COUPLING_TOOL,
  );
}
