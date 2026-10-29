import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCouplingReport, evaluateCoupling } from '../../../../shared/rules/coupling.mjs';
import {
  featureRoleContract,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';

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

export function outerClass(className) {
  return className.split('$')[0];
}

function packageOf(className) {
  const index = className.lastIndexOf('.');
  return index < 0 ? ROOT_PACKAGE : className.slice(0, index);
}

function featurePackage(module, directory) {
  const name = packageOf(module);
  const qualifier = name.slice(0, name.lastIndexOf('/') + 1);
  const parts = name.slice(qualifier.length).split('.');
  for (let length = parts.length; length > 0; length -= 1) {
    const folder = parts.slice(0, length).join('/');
    if (directory === folder || directory.endsWith(`/${folder}`)) {
      return `${qualifier}${parts.slice(0, length).join('.')}`;
    }
  }
  return directory;
}

function packageRoles(layout, fileOf) {
  const roleOfFile = featureRoleContract(layout ?? {}, PUBLIC_FACES.jvm);
  return (module) => {
    const role = roleOfFile(fileOf(module));
    return role.kind === 'feature'
      ? { ...role, directory: featurePackage(module, role.directory) }
      : role;
  };
}

export function analyzeJavaCoupling({ classes, edges, fileOf, moduleOf = outerClass, layout }) {
  return buildCouplingReport({
    modules: [...new Set(classes.map(moduleOf))].sort(),
    edges: edges.map((edge) => ({
      source: moduleOf(edge.source),
      target: moduleOf(edge.target),
    })),
    packageOf,
    fileOf,
    roleOf: packageRoles(layout, fileOf),
  });
}

export function readCouplingFindings(
  reportRoot,
  { projectRoot, sourceRoots, kotlin, files, layout },
) {
  const jdeps = path.join(reportRoot, JDEPS_REPORT);
  const classList = path.join(reportRoot, JDEPS_CLASSES);
  if (!existsSync(jdeps) || !existsSync(classList)) {
    return [];
  }
  const classes = readFileSync(classList, 'utf8').split(/\r?\n/).filter(Boolean);
  function fileOf(className) {
    const known = kotlin?.fileOf.get(className) ?? files?.get(className);
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
    layout,
  });
  return evaluateCoupling(report, COUPLING_TOOL);
}
