import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  hasScriptSources,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mjs';
import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { angularWorkspace, javascriptWorkspaces, nxWorkspace } from './javascript-workspaces.mjs';
import { JVM_MARKERS, gradleComposite, jvmBuilds } from './jvm-builds.mjs';
import { PYTHON_MARKERS, PYTHON_PROJECT_MARKERS, pythonWorkspace } from './python-projects.mjs';
import {
  directoriesWith,
  isInside,
  isSkippedLocation,
  listRepositoryFiles,
  outermost,
} from './repository-files.mjs';

const MANIFEST = 'package.json';

const ROOT_SOURCES_ORIGIN = 'repository root sources';

function rootJavascript(root, rootConfig) {
  return existsSync(path.join(root, MANIFEST)) && hasScriptSources(rootConfig, root)
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
  return sortKey(left).localeCompare(sortKey(right), 'en', { numeric: true });
}

function nestedPython(directories) {
  return outermost(
    directories.filter((directory) => directory !== '.' && !isSkippedLocation(directory)),
  ).map((directory) => ({ path: directory, origin: 'Python project' }));
}

const SCRIPT_ORIGINS = { typescript: 'TypeScript package', javascript: 'JavaScript package' };

function nestedScripts(root, directories) {
  return outermost(
    directories.filter((directory) => directory !== '.' && !isSkippedLocation(directory)),
  ).flatMap((directory) => {
    const preset = scriptProjectPreset({}, path.join(root, directory));
    return preset === undefined ? [] : [{ path: directory, origin: SCRIPT_ORIGINS[preset] }];
  });
}

function candidatesOf(root, files) {
  const python = nestedPython(directoriesWith(root, files, PYTHON_PROJECT_MARKERS));
  const jvm = jvmBuilds(root, directoriesWith(root, files, JVM_MARKERS)).filter(
    (build) => build.path !== '.',
  );
  const scripts = nestedScripts(root, directoriesWith(root, files, [MANIFEST]));
  return [...python, ...jvm, ...scripts];
}

function isExcludedFolder(folder, exclude) {
  const inside = `${folder}/project-file`;
  return exclude.some((glob) => globMatcher(glob).test(inside));
}

export function undeclaredProjects({ root, files, projects, exclude = [] }) {
  const covering = projects.filter((project) => project.path !== '.');
  return candidatesOf(root, files)
    .filter((candidate) => !covering.some((project) => isInside(candidate.path, project.path)))
    .filter((candidate) => !isExcludedFolder(candidate.path, exclude))
    .toSorted(byPath);
}

function workspacesOf(root, files, submodules) {
  const nxProjects = directoriesWith(root, files, ['project.json']).filter(
    (directory) => !isSkippedLocation(directory),
  );
  function withSubmodules(directories) {
    return [...new Set([...directories, ...submodules])];
  }
  return [
    javascriptWorkspaces(root, withSubmodules(directoriesWith(root, files, [MANIFEST]))),
    nxWorkspace(root, nxProjects),
    angularWorkspace(root),
    gradleComposite(root),
    pythonWorkspace(root, withSubmodules(directoriesWith(root, files, PYTHON_MARKERS))),
  ];
}

function rejectSubmoduleMembers(members, submodules) {
  const covered = members.find(({ path: member }) => submodules.includes(member));
  if (covered !== undefined) {
    throw configError(
      `The ${covered.origin} cover ${covered.path}, a Git submodule, which nitpicker does not gate ` +
        `from the repository around it. List the other projects in "projects" of ${CONFIG_FILE_NAME}, ` +
        `and run nitpicker inside ${covered.path} for its own changes`,
    );
  }
}

export function detectProjects({
  root,
  rootConfig = {},
  files = listRepositoryFiles(root),
  submodules = [],
}) {
  const workspaces = workspacesOf(root, files, submodules);
  rejectSubmoduleMembers(
    workspaces.flatMap((workspace) => workspace.members),
    submodules,
  );
  const declared = workspaces.some((workspace) => workspace.declared);
  const members = unique(workspaces.flatMap((workspace) => workspace.members));
  const multiple = declared && members.some((entry) => entry.path !== '.');
  const entries = multiple
    ? unique([...rootJavascript(root, rootConfig), ...members]).toSorted(byPath)
    : [];
  return { declared, entries, multiple };
}
