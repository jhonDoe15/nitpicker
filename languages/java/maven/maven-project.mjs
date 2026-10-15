import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../ingest/common.mjs';

const SCOPES = new Set(['compile', 'provided', 'runtime', 'test', 'system']);
const MAIN_COMPILE_SCOPES = new Set(['compile', 'provided', 'system']);
const TEST_COMPILE_SCOPES = new Set([...MAIN_COMPILE_SCOPES, 'test']);
const BUILD_HELPER = 'org.codehaus.mojo:build-helper-maven-plugin';
const JACOCO = 'org.jacoco:jacoco-maven-plugin';
const SUREFIRE = 'org.apache.maven.plugins:maven-surefire-plugin';
const COMPILER = 'org.apache.maven.plugins:maven-compiler-plugin';

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
          path.resolve(basedir, source.text ?? '.'),
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

function resolvedText(build, basedir, name) {
  const value = textAt(build, name);
  return value === undefined ? undefined : path.resolve(basedir, value);
}

function compilerSettings(project, plugins) {
  const configuration = child(plugins.get(COMPILER), 'configuration');
  const setting = (name, property) =>
    textAt(configuration, name) ?? textAt(project, 'properties', property);
  return {
    release: setting('release', 'maven.compiler.release'),
    source: setting('source', 'maven.compiler.source'),
    target: setting('target', 'maven.compiler.target'),
    encoding:
      setting('encoding', 'maven.compiler.encoding') ??
      textAt(project, 'properties', 'project.build.sourceEncoding'),
    args: [
      ...all(configuration, 'compilerArgs', 'arg').flatMap((arg) => arg.text ?? []),
      ...(textAt(configuration, 'compilerArgument')?.split(/\s+/u) ?? []),
      ...(setting('enablePreview', 'maven.compiler.enablePreview') === 'true'
        ? ['--enable-preview']
        : []),
    ],
  };
}

function describeModule(project, { basedir, pomFile }) {
  const build = child(project, 'build');
  const plugins = pluginsOf(project);
  const buildDirectory = resolvedText(build, basedir, 'directory') ?? path.join(basedir, 'target');
  const surefire = plugins.get(SUREFIRE);
  const reports = surefire && textAt(surefire, 'configuration', 'reportsDirectory');
  const destFile = jacocoDestFile(plugins.get(JACOCO));
  return {
    basedir,
    pomFile,
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
    resourceRoots: all(build, 'resources', 'resource')
      .map((resource) => textAt(resource, 'directory'))
      .filter((directory) => directory !== undefined)
      .map((directory) => path.resolve(basedir, directory)),
    surefireReports: reports
      ? path.resolve(basedir, reports)
      : path.join(buildDirectory, 'surefire-reports'),
    jacocoDestFile: destFile === undefined ? undefined : path.resolve(basedir, destFile),
    archunitIncludes: textAt(project, 'properties', 'nitpicker.archunit.includes'),
    compiler: compilerSettings(project, plugins),
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
    modules.push(describeModule(project, { basedir, pomFile }));
    const children = all(project, 'modules', 'module')
      .filter((module) => module.text !== undefined)
      .map((module) => pomFileOf(basedir, module.text));
    pending.push(...children.filter((file) => !pending.includes(file)));
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
      const index = [5, 4].find(
        (position) => SCOPES.has(parts[position]) && position < parts.length - 1,
      );
      return index === undefined
        ? []
        : [
            {
              groupId: parts[0],
              artifactId: parts[1],
              type: parts[2],
              scope: parts[index],
              file: parts.slice(index + 1).join(':'),
            },
          ];
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
