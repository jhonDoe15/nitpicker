import { existsSync } from 'node:fs';
import path from 'node:path';
import { hasScriptSources } from '../../configuration/project-checks/preset-detection.mjs';
import { javascriptWorkspaces } from './javascript-workspaces.mjs';
import { JVM_MARKERS, jvmBuilds } from './jvm-builds.mjs';
import { PYTHON_MARKERS, PYTHON_PROJECT_MARKERS, pythonWorkspace } from './python-projects.mjs';
import {
  directoriesWith,
  isInside,
  isSkippedLocation,
  listRepositoryFiles,
  outermost,
} from './repository-files.mjs';

const ROOT_SOURCES_ORIGIN = 'repository root sources';

function rootJavascript(root, rootConfig) {
  return existsSync(path.join(root, 'package.json')) && hasScriptSources(rootConfig, root)
    ? [{ path: '.', origin: ROOT_SOURCES_ORIGIN }]
    : [];
}

function unique(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const fresh = !seen.has(entry.path);
    seen.add(entry.path);
    return fresh;
  });
}

function sortKey(entry) {
  return entry.path === '.' ? '' : entry.path;
}

function byPath(left, right) {
  return sortKey(left).localeCompare(sortKey(right));
}

function nestedPython(directories) {
  return outermost(
    directories.filter((directory) => directory !== '.' && !isSkippedLocation(directory)),
  ).map((directory) => ({ path: directory, origin: 'Python project' }));
}

function candidatesOf(root, files) {
  const python = nestedPython(directoriesWith(root, files, PYTHON_PROJECT_MARKERS));
  const jvm = jvmBuilds(root, directoriesWith(root, files, JVM_MARKERS)).filter(
    (build) => build.path !== '.',
  );
  return [...python, ...jvm];
}

export function undeclaredProjects({ root, files, projects }) {
  const covering = projects.filter((project) => project.path !== '.');
  return candidatesOf(root, files)
    .filter((candidate) => !covering.some((project) => isInside(candidate.path, project.path)))
    .toSorted(byPath);
}

export function detectProjects({ root, rootConfig = {}, files = listRepositoryFiles(root) }) {
  const javascript = javascriptWorkspaces(root, directoriesWith(root, files, ['package.json']));
  const python = pythonWorkspace(root, directoriesWith(root, files, PYTHON_MARKERS));
  const declared = javascript.declared || python.declared;
  const members = unique([...javascript.members, ...python.members]);
  const multiple = declared && members.some((entry) => entry.path !== '.');
  const entries = multiple
    ? unique([...rootJavascript(root, rootConfig), ...members]).toSorted(byPath)
    : [];
  return { declared, entries, multiple };
}
