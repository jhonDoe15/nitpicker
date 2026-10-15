import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionRoute } from './advice/exception-route.mjs';

const DEPENDENCIES_TOOL = 'dependencies';
const UNUSED_RULE = 'unused-declared-dependency';
const DEPENDENCIES_REPORT = 'dependencies.json';
const WIRING_ONLY = /(?:^|-)starter(?:-|$)|(?:^|-)bom$|-platform$|-dependencies$/;

function isUnused(entry) {
  return (entry.archives ?? []).length > 0 && entry.used !== true && !WIRING_ONLY.test(entry.name);
}

const ALTERNATIVES = {
  gradle: (entry) =>
    `is declared in ${entry.configuration} but no main class uses it. ` +
    'Remove it, declare it runtimeOnly if it is only needed at run time, ' +
    'or compileOnly if only its source annotations are needed.',
  maven: () =>
    'has compile scope but no main class uses it. ' +
    'Remove it, give it runtime scope if it is only needed at run time, ' +
    'or provided scope if only its source annotations are needed.',
};

function unusedFinding(entry, { buildFile, build }) {
  const id = `${entry.group}:${entry.name}`;
  return {
    tool: DEPENDENCIES_TOOL,
    rule: UNUSED_RULE,
    path: buildFile,
    identity: `unused:${id}`,
    message: `Dependency ${id} ${ALTERNATIVES[build](entry)} ${exceptionRoute(DEPENDENCIES_TOOL, UNUSED_RULE)}`,
    classification: 'enforceable',
  };
}

export function dependencyFindings(report) {
  if (report.analyzed !== true) {
    return [];
  }
  const build = report.build ?? 'gradle';
  const buildFile = report.buildFile ?? (build === 'maven' ? 'pom.xml' : 'build.gradle');
  const unused = (report.declared ?? []).filter((entry) => isUnused(entry));
  const byId = new Map(unused.map((entry) => [`${entry.group}:${entry.name}`, entry]));
  return [...byId.values()].map((entry) => unusedFinding(entry, { buildFile, build }));
}

export function readDependencyFindings(reportRoot) {
  const report = path.join(reportRoot, DEPENDENCIES_REPORT);
  return existsSync(report) ? dependencyFindings(JSON.parse(readFileSync(report, 'utf8'))) : [];
}
