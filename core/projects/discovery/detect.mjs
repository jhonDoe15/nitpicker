import { existsSync } from 'node:fs';
import path from 'node:path';
import { hasScriptSources } from '../../configuration/project-checks/preset-detection.mjs';
import { javascriptWorkspaces } from './javascript-workspaces.mjs';
import { JVM_MARKERS, jvmBuilds } from './jvm-builds.mjs';
import { pythonProjects } from './python-projects.mjs';
import { directoriesWith, listRepositoryFiles } from './repository-files.mjs';

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

function isMultiple(entries, declared) {
  return entries.length > 1 || (declared && entries.some((entry) => entry.path !== '.'));
}

export function detectProjects({ root, rootConfig = {}, files = listRepositoryFiles(root) }) {
  const javascript = javascriptWorkspaces(root, directoriesWith(root, files, ['package.json']));
  const python = pythonProjects(root, directoriesWith(root, files, ['pyproject.toml']));
  const jvm = jvmBuilds(root, directoriesWith(root, files, JVM_MARKERS));
  const declared = javascript.declared || python.declared;
  const others = unique([...javascript.members, ...python.members, ...jvm]);
  if (others.length === 0) {
    return { declared, entries: [], multiple: false };
  }
  const entries = unique([...rootJavascript(root, rootConfig), ...others]).toSorted(byPath);
  return { declared, entries, multiple: isMultiple(entries, declared) };
}
