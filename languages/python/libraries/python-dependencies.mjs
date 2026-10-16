import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  groupKind,
  isDevelopmentGroup,
  namesOf,
  normalizeRequirementName,
  requirementName,
} from './dependencies/dependency-names.mjs';
import { parseToml, readText } from './dependencies/dependency-text.mjs';
import { requirementGroups } from './dependencies/requirement-files.mjs';
import { setupCfgGroups, setupPyGroups } from './dependencies/setup-files.mjs';

export { isDevelopmentGroup, normalizeRequirementName, requirementName };

function keysOf(table) {
  return table === null || typeof table !== 'object' || Array.isArray(table)
    ? []
    : Object.keys(table)
        .filter((name) => name.toLowerCase() !== 'python')
        .map(normalizeRequirementName);
}

function groupsOf(groups, classify) {
  return Object.entries(groups ?? {}).map(([group, value]) => ({
    kind: classify(group),
    names: namesOf(value),
  }));
}

function poetryGroups(poetry) {
  return Object.entries(poetry?.group ?? {}).map(([group, value]) => ({
    kind: group === 'main' ? 'runtime' : 'development',
    names: keysOf(value?.dependencies),
  }));
}

function projectTables(parsed) {
  const { project, tool } = parsed;
  const pdm = Object.values(tool?.pdm?.['dev-dependencies'] ?? {}).flatMap(namesOf);
  return [
    { kind: 'runtime', names: namesOf(project?.dependencies) },
    ...groupsOf(project?.['optional-dependencies'], groupKind),
    ...groupsOf(parsed['dependency-groups'], () => 'development'),
    { kind: 'runtime', names: keysOf(tool?.poetry?.dependencies) },
    ...poetryGroups(tool?.poetry),
    { kind: 'development', names: keysOf(tool?.poetry?.['dev-dependencies']) },
    { kind: 'development', names: namesOf(tool?.uv?.['dev-dependencies']) },
    { kind: 'development', names: pdm },
  ];
}

function pyprojectGroups(projectRoot) {
  const file = path.join(projectRoot, 'pyproject.toml');
  return existsSync(file) ? projectTables(parseToml(readText(file))) : [];
}

function pipfileGroups(projectRoot) {
  const file = path.join(projectRoot, 'Pipfile');
  if (!existsSync(file)) {
    return [];
  }
  const parsed = parseToml(readText(file));
  return [
    { kind: 'runtime', names: keysOf(parsed.packages) },
    { kind: 'development', names: keysOf(parsed['dev-packages']) },
  ];
}

function namesOfKind(groups, kind) {
  return [...new Set(groups.filter((group) => group.kind === kind).flatMap(({ names }) => names))];
}

export function readPythonDependencies(projectRoot) {
  const groups = [
    ...pyprojectGroups(projectRoot),
    ...pipfileGroups(projectRoot),
    ...requirementGroups(projectRoot),
    ...setupCfgGroups(projectRoot),
    ...setupPyGroups(projectRoot),
  ];
  const runtime = namesOfKind(groups, 'runtime');
  return {
    runtime,
    development: namesOfKind(groups, 'development').filter((name) => !runtime.includes(name)),
  };
}
