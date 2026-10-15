import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEPENDENCIES_TOOL = 'dependencies';
const NOT_PINNED_RULE = 'dependency-version-not-pinned';
const UNUSED_RULE = 'unused-declared-dependency';
const DEPENDENCIES_REPORT = 'dependencies.json';
const FLOATING_VERSION = /\+|^latest\.|SNAPSHOT$|^[[(]/i;
const WIRING_ONLY = /(?:^|-)starter(?:-|$)|(?:^|-)bom$|-platform$|-dependencies$/;

function exceptionHint(rule) {
  return `If it is right here, add an exception for ${DEPENDENCIES_TOOL}/${rule} in nitpicker.config.json.`;
}

export function isFloating({ version, changing }) {
  return changing === true || FLOATING_VERSION.test(version ?? '');
}

function floatingFinding(entry, buildFile) {
  const id = `${entry.group}:${entry.name}`;
  return {
    tool: DEPENDENCIES_TOOL,
    rule: NOT_PINNED_RULE,
    path: buildFile,
    identity: `floating:${id}:${entry.version}`,
    message: `Dependency ${id} has the floating version ${entry.version === '' ? '(changing)' : entry.version}, so the build can change without a commit. Pin one exact version. ${exceptionHint(NOT_PINNED_RULE)}`,
    classification: 'enforceable',
  };
}

function isUnused(entry, referenced) {
  return (
    (entry.archives ?? []).length > 0 &&
    !WIRING_ONLY.test(entry.name) &&
    !entry.archives.some((archive) => referenced.has(archive))
  );
}

function unusedFinding(entry, buildFile) {
  const id = `${entry.group}:${entry.name}`;
  return {
    tool: DEPENDENCIES_TOOL,
    rule: UNUSED_RULE,
    path: buildFile,
    identity: `unused:${id}`,
    message: `Dependency ${id} is declared in ${entry.configuration} but no main class uses it. Remove it, or declare it runtimeOnly if it is only needed at run time. ${exceptionHint(UNUSED_RULE)}`,
    classification: 'enforceable',
  };
}

export function dependencyFindings(report) {
  const buildFile = report.buildFile ?? 'build.gradle';
  const referenced = new Set(report.referenced ?? []);
  const seen = new Set();
  return (report.declared ?? []).flatMap((entry) => {
    const key = `${entry.group}:${entry.name}:${entry.version}`;
    const duplicate = seen.has(key);
    seen.add(key);
    return [
      ...(!report.locked && !duplicate && isFloating(entry)
        ? [floatingFinding(entry, buildFile)]
        : []),
      ...(!duplicate && isUnused(entry, referenced) ? [unusedFinding(entry, buildFile)] : []),
    ];
  });
}

export function readDependencyFindings(reportRoot) {
  const report = path.join(reportRoot, DEPENDENCIES_REPORT);
  return existsSync(report) ? dependencyFindings(JSON.parse(readFileSync(report, 'utf8'))) : [];
}
