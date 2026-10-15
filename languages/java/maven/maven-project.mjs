import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../ingest/common.mjs';

const SCOPES = new Set(['compile', 'provided', 'runtime', 'test', 'system']);
const MAIN_COMPILE_SCOPES = new Set(['compile', 'provided', 'system']);
const BUILD_HELPER = 'org.codehaus.mojo:build-helper-maven-plugin';
const JACOCO = 'org.jacoco:jacoco-maven-plugin';
const SUREFIRE = 'org.apache.maven.plugins:maven-surefire-plugin';

function child(element, ...names) {
  return names.reduce((current, name) => current && childrenNamed(current, name)[0], element);
}

function textAt(element, ...names) {
  return child(element, ...names)?.text;
}

function all(element, ...names) {
  const parent = child(element, ...names.slice(0, -1));
  return parent === undefined ? [] : childrenNamed(parent, names.at(-1));
}

function coordinates(project) {
  const groupId = textAt(project, 'groupId') ?? textAt(project, 'parent', 'groupId');
  return `${groupId}:${textAt(project, 'artifactId')}`;
}

function pluginsOf(project) {
  return new Map(
    all(project, 'build', 'plugins', 'plugin').map((plugin) => [
      `${textAt(plugin, 'groupId') ?? 'org.apache.maven.plugins'}:${textAt(plugin, 'artifactId')}`,
      plugin,
    ]),
  );
}

function executionsWithGoal(plugin, goal) {
  return all(plugin, 'executions', 'execution').filter((execution) =>
    all(execution, 'goals', 'goal').some((element) => element.text === goal),
  );
}

function helperRoots(plugin, goal, basedir) {
  return plugin === undefined
    ? []
    : executionsWithGoal(plugin, goal).flatMap((execution) =>
        all(execution, 'configuration', 'sources', 'source').map((source) =>
          path.resolve(basedir, source.text ?? ''),
        ),
      );
}

function jacocoDestFile(plugin) {
  const execution =
    plugin === undefined ? undefined : executionsWithGoal(plugin, 'prepare-agent')[0];
  return execution === undefined
    ? undefined
    : (textAt(execution, 'configuration', 'destFile') ??
        textAt(plugin, 'configuration', 'destFile'));
}

function describeModule(project, basedir) {
  const build = child(project, 'build');
  const plugins = pluginsOf(project);
  const buildDirectory = textAt(build, 'directory') ?? path.join(basedir, 'target');
  const surefire = plugins.get(SUREFIRE);
  return {
    basedir,
    coordinates: coordinates(project),
    packaging: textAt(project, 'packaging') ?? 'jar',
    buildDirectory,
    outputDirectory: textAt(build, 'outputDirectory') ?? path.join(buildDirectory, 'classes'),
    testOutputDirectory:
      textAt(build, 'testOutputDirectory') ?? path.join(buildDirectory, 'test-classes'),
    sourceRoots: [
      textAt(build, 'sourceDirectory') ?? path.join(basedir, 'src/main/java'),
      ...helperRoots(plugins.get(BUILD_HELPER), 'add-source', basedir),
    ],
    testSourceRoots: [
      textAt(build, 'testSourceDirectory') ?? path.join(basedir, 'src/test/java'),
      ...helperRoots(plugins.get(BUILD_HELPER), 'add-test-source', basedir),
    ],
    resourceRoots: all(build, 'resources', 'resource')
      .map((resource) => textAt(resource, 'directory'))
      .filter(Boolean),
    surefireReports:
      (surefire && textAt(surefire, 'configuration', 'reportsDirectory')) ??
      path.join(buildDirectory, 'surefire-reports'),
    jacocoDestFile: jacocoDestFile(plugins.get(JACOCO)),
    archunitIncludes: textAt(project, 'properties', 'nitpicker.archunit.includes'),
  };
}

function rawCoordinates(pomFile) {
  return coordinates(parseXml(readFileSync(pomFile, 'utf8')));
}

function pomFileOf(directory, module) {
  const target = path.resolve(directory, module);
  return target.endsWith('.xml') ? target : path.join(target, 'pom.xml');
}

export function readReactor(projectRoot, effectivePom) {
  const document = parseXml(effectivePom);
  const projects = document.name === 'projects' ? childrenNamed(document, 'project') : [document];
  const byCoordinates = new Map(projects.map((project) => [coordinates(project), project]));
  const modules = [];
  const pending = [path.join(projectRoot, 'pom.xml')];
  for (const pomFile of pending) {
    const project = existsSync(pomFile) ? byCoordinates.get(rawCoordinates(pomFile)) : undefined;
    if (
      project === undefined ||
      modules.some((module) => module.basedir === path.dirname(pomFile))
    ) {
      continue;
    }
    const basedir = path.dirname(pomFile);
    modules.push(describeModule(project, basedir));
    pending.push(
      ...all(project, 'modules', 'module').map((module) => pomFileOf(basedir, module.text ?? '')),
    );
  }
  return modules;
}

export function parseDependencyList(text) {
  return text
    .split(/\r?\n/u)
    .map((line) =>
      line
        .trim()
        .replace(/ -- module .*$/u, '')
        .replace(/ \(optional\)$/u, ''),
    )
    .flatMap((line) => {
      const parts = line.split(':');
      const index = parts.findIndex((part, position) => position >= 3 && SCOPES.has(part));
      return index === -1 || index === parts.length - 1
        ? []
        : [{ scope: parts[index], file: parts.slice(index + 1).join(':') }];
    });
}

export function moduleClasspaths(module, dependencies) {
  return {
    mainCompile: dependencies
      .filter((entry) => MAIN_COMPILE_SCOPES.has(entry.scope))
      .map((entry) => entry.file),
    testRuntime: [
      module.testOutputDirectory,
      module.outputDirectory,
      ...dependencies.map((entry) => entry.file),
    ],
  };
}
