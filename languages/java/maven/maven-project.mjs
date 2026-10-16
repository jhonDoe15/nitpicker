import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childAt, childrenAt, childrenNamed, parseXml } from '../ingest/common.mjs';
import { compilerSettings } from './errorprone/maven-compiler.mjs';

const SCOPES = new Set(['compile', 'provided', 'runtime', 'test', 'system']);
const MAIN_COMPILE_SCOPES = new Set(['compile', 'provided', 'system']);
const TEST_COMPILE_SCOPES = new Set([...MAIN_COMPILE_SCOPES, 'test']);
const BUILD_HELPER = 'org.codehaus.mojo:build-helper-maven-plugin';
const JACOCO = 'org.jacoco:jacoco-maven-plugin';
const SUREFIRE = 'org.apache.maven.plugins:maven-surefire-plugin';
const FAILSAFE = 'org.apache.maven.plugins:maven-failsafe-plugin';
const AGENT_GOALS = ['prepare-agent', 'prepare-agent-integration'];
const FAILSAFE_SKIPS = ['skip', 'skipITs', 'skipTests'];
const SKIP_PROPERTIES = ['skipITs', 'skipTests'];
const VERIFY_BUILD = [
  'verify',
  '-Djacoco.haltOnFailure=false',
  '-Dgpg.skip=true',
  '-Dmaven.javadoc.skip=true',
  '-Dmaven.source.skip=true',
  '-Dmaven.deploy.skip=true',
  '-Djib.skip=true',
  '-Ddependency-check.skip=true',
  '-Drat.skip=true',
  '-Dlicense.skip=true',
  '-Dlicense.skipDownloadLicenses=true',
  '-Dlicense.skipAggregateDownloadLicenses=true',
  '-Djapicmp.skip=true',
];

function textAt(element, ...names) {
  return childAt(element, ...names)?.text;
}

function coordinates(project) {
  const groupId = textAt(project, 'groupId') ?? textAt(project, 'parent', 'groupId');
  return `${groupId}:${textAt(project, 'artifactId')}`;
}

function pluginsOf(project) {
  return new Map(
    childrenAt(project, 'build', 'plugins', 'plugin').map((plugin) => [
      `${textAt(plugin, 'groupId') ?? 'org.apache.maven.plugins'}:${textAt(plugin, 'artifactId')}`,
      plugin,
    ]),
  );
}

function executionsWithGoal(plugin, goal) {
  return childrenAt(plugin, 'executions', 'execution').filter((execution) =>
    childrenAt(execution, 'goals', 'goal').some((element) => element.text === goal),
  );
}

function configured(execution, plugin, name) {
  return textAt(execution, 'configuration', name) ?? textAt(plugin, 'configuration', name);
}

function isTrue(text) {
  return text?.trim().toLowerCase() === 'true';
}

function runsFailsafe(project, plugin) {
  if (
    plugin === undefined ||
    SKIP_PROPERTIES.some((name) => isTrue(textAt(project, 'properties', name)))
  ) {
    return false;
  }
  return executionsWithGoal(plugin, 'integration-test').some(
    (execution) =>
      textAt(execution, 'phase') !== 'none' &&
      !FAILSAFE_SKIPS.some((name) => isTrue(configured(execution, plugin, name))),
  );
}

function helperRoots(plugin, goal, basedir) {
  return plugin === undefined
    ? []
    : executionsWithGoal(plugin, goal).flatMap((execution) =>
        childrenAt(execution, 'configuration', 'sources', 'source').map((source) =>
          path.resolve(basedir, source.text ?? '.'),
        ),
      );
}

function jacocoDestFiles(plugin, basedir) {
  const executions =
    plugin === undefined ? [] : AGENT_GOALS.flatMap((goal) => executionsWithGoal(plugin, goal));
  const files = executions
    .map((execution) => configured(execution, plugin, 'destFile'))
    .filter((file) => file !== undefined);
  return [...new Set(files.map((file) => path.resolve(basedir, file)))];
}

function resolvedText(build, basedir, name) {
  const value = textAt(build, name);
  return value === undefined ? undefined : path.resolve(basedir, value);
}

function reportsDirectory(plugin, goal) {
  return plugin === undefined
    ? undefined
    : configured(executionsWithGoal(plugin, goal)[0], plugin, 'reportsDirectory');
}

function describeModule(project, basedir) {
  const build = childAt(project, 'build');
  const plugins = pluginsOf(project);
  const buildDirectory = resolvedText(build, basedir, 'directory') ?? path.join(basedir, 'target');
  const reports = reportsDirectory(plugins.get(SUREFIRE), 'test');
  const failsafeReports = reportsDirectory(plugins.get(FAILSAFE), 'integration-test');
  return {
    basedir,
    coordinates: coordinates(project),
    packaging: textAt(project, 'packaging') ?? 'jar',
    buildDirectory,
    outputDirectory:
      resolvedText(build, basedir, 'outputDirectory') ?? path.join(buildDirectory, 'classes'),
    testOutputDirectory:
      resolvedText(build, basedir, 'testOutputDirectory') ??
      path.join(buildDirectory, 'test-classes'),
    sourceRoots: [
      resolvedText(build, basedir, 'sourceDirectory') ?? path.join(basedir, 'src/main/java'),
      ...helperRoots(plugins.get(BUILD_HELPER), 'add-source', basedir),
    ],
    testSourceRoots: [
      resolvedText(build, basedir, 'testSourceDirectory') ?? path.join(basedir, 'src/test/java'),
      ...helperRoots(plugins.get(BUILD_HELPER), 'add-test-source', basedir),
    ],
    resourceRoots: childrenAt(build, 'resources', 'resource')
      .map((resource) => textAt(resource, 'directory'))
      .filter((directory) => directory !== undefined)
      .map((directory) => path.resolve(basedir, directory)),
    surefireReports: reports
      ? path.resolve(basedir, reports)
      : path.join(buildDirectory, 'surefire-reports'),
    failsafeReports: path.resolve(
      basedir,
      failsafeReports ?? path.join(buildDirectory, 'failsafe-reports'),
    ),
    runsFailsafe: runsFailsafe(project, plugins.get(FAILSAFE)),
    jacocoDestFiles: jacocoDestFiles(plugins.get(JACOCO), basedir),
    archunitIncludes: textAt(project, 'properties', 'nitpicker.archunit.includes'),
    compiler: compilerSettings(project),
  };
}

function rawCoordinates(pomFile) {
  return existsSync(pomFile) ? coordinates(parseXml(readFileSync(pomFile, 'utf8'))) : undefined;
}

function pomFileOf(directory, module) {
  const target = path.resolve(directory, module);
  return target.endsWith('.xml') ? target : path.join(target, 'pom.xml');
}

function depth(relative) {
  return relative.split(path.sep).length;
}

function insideOf(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function matchProject(pomFile, candidates) {
  const wanted = rawCoordinates(pomFile);
  const exact = candidates.find((project) => coordinates(project) === wanted);
  if (exact !== undefined) {
    return exact;
  }
  const basedir = path.dirname(pomFile);
  const [nearest] = candidates
    .map((project) => ({ project, build: textAt(project, 'build', 'directory') }))
    .filter(({ build }) => build !== undefined && insideOf(basedir, build))
    .sort(
      (left, right) =>
        depth(path.relative(basedir, left.build)) - depth(path.relative(basedir, right.build)),
    );
  if (nearest === undefined) {
    throw new Error(
      `Maven module ${pomFile} is not in the effective POM; nitpicker cannot read it`,
    );
  }
  return nearest.project;
}

function moduleDirectory(projectRoot, pomFile, modules) {
  const basedir = path.dirname(pomFile);
  if (basedir !== projectRoot && !insideOf(projectRoot, basedir)) {
    throw new Error(
      `Maven module ${basedir} lies outside ${projectRoot}; run nitpicker from a directory that holds every module`,
    );
  }
  if (modules.some((module) => module.basedir === basedir)) {
    throw new Error(
      `${basedir} holds more than one Maven module; nitpicker reads one module per directory`,
    );
  }
  return basedir;
}

export function readReactor(projectRoot, effectivePom) {
  const document = parseXml(effectivePom);
  const candidates = document.name === 'projects' ? childrenNamed(document, 'project') : [document];
  const modules = [];
  const pending = [path.join(projectRoot, 'pom.xml')];
  for (const pomFile of pending) {
    const basedir = moduleDirectory(projectRoot, pomFile, modules);
    const project = matchProject(pomFile, candidates);
    candidates.splice(candidates.indexOf(project), 1);
    modules.push(describeModule(project, basedir));
    const children = childrenAt(project, 'modules', 'module')
      .filter((module) => module.text !== undefined)
      .map((module) => pomFileOf(basedir, module.text));
    pending.push(...children.filter((file) => !pending.includes(file)));
  }
  return modules;
}

export function lifecycleArgs(modules) {
  return modules.some((module) => module.runsFailsafe) ? VERIFY_BUILD : ['test'];
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
      const index = [5, 4].find(
        (position) => SCOPES.has(parts[position]) && position < parts.length - 1,
      );
      return index === undefined
        ? []
        : [{ scope: parts[index], file: parts.slice(index + 1).join(':') }];
    });
}

function filesIn(dependencies, scopes) {
  return dependencies.filter((entry) => scopes.has(entry.scope)).map((entry) => entry.file);
}

export function moduleClasspaths(module, dependencies) {
  return {
    mainCompile: filesIn(dependencies, MAIN_COMPILE_SCOPES),
    testCompile: filesIn(dependencies, TEST_COMPILE_SCOPES),
    testRuntime: [
      module.testOutputDirectory,
      module.outputDirectory,
      ...dependencies.map((entry) => entry.file),
    ],
  };
}
