import { isPublished, isTrue } from './configuration/publishing.mts';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { textOf } from '../../../shared/values/readers.mts';
import { type XmlElement, childrenNamed, parseXml } from '../../../shared/values/xml.mts';
import { childAt, childrenAt, executionsWithGoal, pluginsOf, textAt } from './typed/pom-values.mts';
import type { ModuleBase, ModuleDescription } from './typed/module-description.mts';
import { compilerSettings } from './errorprone/maven-compiler.mjs';
import { kotlinRoots } from './kotlin/kotlin-roots.mts';
import { testJvmArguments } from './configuration/surefire-jvm.mts';

const DIRECTORY = 'directory';
const BUILD_HELPER = 'org.codehaus.mojo:build-helper-maven-plugin';
const GMAVENPLUS = 'org.codehaus.gmavenplus:gmavenplus-plugin';
const GROOVY_TEST_ROOT = 'src/test/groovy';
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

function coordinates(project: XmlElement): string {
  const groupId = textAt(project, 'groupId') ?? textAt(project, 'parent', 'groupId');
  return `${textOf(groupId)}:${textOf(textAt(project, 'artifactId'))}`;
}

function configured(
  execution: XmlElement | undefined,
  plugin: XmlElement | undefined,
  name: string,
): string | undefined {
  return textAt(execution, 'configuration', name) ?? textAt(plugin, 'configuration', name);
}

function runsFailsafe(project: XmlElement, plugin: XmlElement | undefined): boolean {
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

function rootsInside(basedir: string, roots: readonly string[]): string[] {
  const resolved = roots.map((root) => path.resolve(basedir, root));
  return [...new Set(resolved.filter((root) => root === basedir || insideOf(basedir, root)))];
}

function helperRoots(plugin: XmlElement | undefined, goal: string, basedir: string): string[] {
  const sources =
    plugin === undefined
      ? []
      : executionsWithGoal(plugin, goal).flatMap((execution) =>
          childrenAt(execution, 'configuration', 'sources', 'source').map(
            (source) => source.text ?? '.',
          ),
        );
  return rootsInside(basedir, sources);
}

function groovyTestRoots(plugin: XmlElement | undefined, basedir: string): string[] {
  const configured = (
    plugin === undefined ? [] : [plugin, ...childrenAt(plugin, 'executions', 'execution')]
  )
    .flatMap((element) => childrenAt(element, 'configuration', 'testSources', 'testSource'))
    .flatMap((source) => textAt(source, DIRECTORY) ?? []);
  const pluginDefault = plugin !== undefined && configured.length === 0;
  const present = existsSync(path.join(basedir, GROOVY_TEST_ROOT));
  return rootsInside(basedir, [
    ...configured,
    ...(pluginDefault || present ? [GROOVY_TEST_ROOT] : []),
  ]);
}

function jacocoDestFiles(plugin: XmlElement | undefined, basedir: string): string[] {
  const executions =
    plugin === undefined ? [] : AGENT_GOALS.flatMap((goal) => executionsWithGoal(plugin, goal));
  const files = executions.flatMap((execution) => configured(execution, plugin, 'destFile') ?? []);
  return [...new Set(files.map((file) => path.resolve(basedir, file)))];
}

function jacocoAgentVersion(plugin: XmlElement | undefined): string | undefined {
  const version = plugin === undefined ? undefined : textAt(plugin, 'version')?.trim();
  const agents = (
    plugin === undefined ? [] : AGENT_GOALS.flatMap((goal) => executionsWithGoal(plugin, goal))
  ).filter((execution) => textAt(execution, 'phase') !== 'none');
  return agents.length === 0 || version === undefined || version.includes('${')
    ? undefined
    : version;
}

function resolvedText(
  build: XmlElement | undefined,
  basedir: string,
  name: string,
): string | undefined {
  const value = textAt(build, name);
  return value === undefined ? undefined : path.resolve(basedir, value);
}

function defaultExecution(plugin: XmlElement | undefined, goal: string): XmlElement | undefined {
  const executions = plugin === undefined ? [] : executionsWithGoal(plugin, goal);
  return (
    executions.find((execution) => textAt(execution, 'id') === `default-${goal}`) ?? executions[0]
  );
}

function setting(plugin: XmlElement | undefined, goal: string, name: string): string | undefined {
  return configured(defaultExecution(plugin, goal), plugin, name);
}

function jacocoSettings(
  plugin: XmlElement | undefined,
  basedir: string,
): Pick<ModuleBase, 'jacocoDestFiles' | 'jacocoAgentVersion'> {
  return {
    jacocoDestFiles: jacocoDestFiles(plugin, basedir),
    jacocoAgentVersion: jacocoAgentVersion(plugin),
  };
}

function packagingOf(project: XmlElement): string {
  return textAt(project, 'packaging') ?? 'jar';
}

function moduleCompiler(project: XmlElement): unknown {
  if (packagingOf(project) === 'pom') {
    return undefined;
  }
  try {
    return compilerSettings(project);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Maven module ${coordinates(project)}: ${reason}`, { cause: error });
  }
}

function testRootsOf(
  build: XmlElement | undefined,
  plugins: ReadonlyMap<string, XmlElement>,
  basedir: string,
): string[] {
  return [
    resolvedText(build, basedir, 'testSourceDirectory') ?? path.join(basedir, 'src/test/java'),
    ...helperRoots(plugins.get(BUILD_HELPER), 'add-test-source', basedir),
    ...groovyTestRoots(plugins.get(GMAVENPLUS), basedir),
  ];
}

function resourceRootsOf(build: XmlElement | undefined, basedir: string): string[] {
  return childrenAt(build, 'resources', 'resource')
    .flatMap((resource) => textAt(resource, DIRECTORY) ?? [])
    .map((directory) => path.resolve(basedir, directory));
}

function describeModule(
  project: XmlElement,
  { basedir, pomFile }: { readonly basedir: string; readonly pomFile: string },
): ModuleBase {
  const build = childAt(project, 'build');
  const plugins = pluginsOf(project);
  const buildDirectory = resolvedText(build, basedir, DIRECTORY) ?? path.join(basedir, 'target');
  const surefire = plugins.get(SUREFIRE);
  const failsafe = plugins.get(FAILSAFE);
  const reports = setting(surefire, 'test', 'reportsDirectory');
  const failsafeReports = setting(failsafe, 'integration-test', 'reportsDirectory');
  const integrationTests = defaultExecution(failsafe, 'integration-test');
  const sourceRoots = [
    resolvedText(build, basedir, 'sourceDirectory') ?? path.join(basedir, 'src/main/java'),
    ...helperRoots(plugins.get(BUILD_HELPER), 'add-source', basedir),
  ];
  return {
    basedir,
    pomFile,
    coordinates: coordinates(project),
    packaging: packagingOf(project),
    buildDirectory,
    outputDirectory:
      resolvedText(build, basedir, 'outputDirectory') ?? path.join(buildDirectory, 'classes'),
    testOutputDirectory:
      resolvedText(build, basedir, 'testOutputDirectory') ??
      path.join(buildDirectory, 'test-classes'),
    sourceRoots,
    testSourceRoots: testRootsOf(build, plugins, basedir),
    resourceRoots: resourceRootsOf(build, basedir),
    surefireReports: reports
      ? path.resolve(basedir, reports)
      : path.join(buildDirectory, 'surefire-reports'),
    failsafeReports: path.resolve(
      basedir,
      failsafeReports ?? path.join(buildDirectory, 'failsafe-reports'),
    ),
    runsFailsafe: runsFailsafe(project, failsafe),
    testJvmArgs: testJvmArguments(project, surefire, defaultExecution(surefire, 'test')),
    integrationTestJvmArgs: testJvmArguments(project, failsafe, integrationTests),
    published: isPublished(project, plugins),
    ...jacocoSettings(plugins.get(JACOCO), basedir),
    archunitIncludes: textAt(project, 'properties', 'nitpicker.archunit.includes'),
    compiler: moduleCompiler(project),
  };
}

function withKotlin(project: XmlElement, module: ModuleBase): ModuleDescription {
  return { ...module, kotlin: kotlinRoots(project, module) };
}

function rawCoordinates(pomFile: string): string | undefined {
  return existsSync(pomFile) ? coordinates(parseXml(readFileSync(pomFile, 'utf8'))) : undefined;
}

function pomFileOf(directory: string, module: string): string {
  const target = path.resolve(directory, module);
  return target.endsWith('.xml') ? target : path.join(target, 'pom.xml');
}

function depth(relative: string): number {
  return relative.split(path.sep).length;
}

function insideOf(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function matchProject(pomFile: string, candidates: readonly XmlElement[]): XmlElement {
  const wanted = rawCoordinates(pomFile);
  const exact = candidates.find((project) => coordinates(project) === wanted);
  if (exact !== undefined) {
    return exact;
  }
  const basedir = path.dirname(pomFile);
  const [nearest] = candidates
    .flatMap((project) => {
      const build = textAt(project, 'build', DIRECTORY);
      return build !== undefined && insideOf(basedir, build) ? [{ project, build }] : [];
    })
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

function moduleDirectory(
  projectRoot: string,
  pomFile: string,
  modules: readonly { readonly basedir: string }[],
): string {
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

export function readReactor(projectRoot: string, effectivePom: string): ModuleDescription[] {
  const document = parseXml(effectivePom);
  const candidates = document.name === 'projects' ? childrenNamed(document, 'project') : [document];
  const modules: ModuleDescription[] = [];
  const pending = [path.join(projectRoot, 'pom.xml')];
  for (const pomFile of pending) {
    const basedir = moduleDirectory(projectRoot, pomFile, modules);
    const project = matchProject(pomFile, candidates);
    candidates.splice(candidates.indexOf(project), 1);
    modules.push(withKotlin(project, describeModule(project, { basedir, pomFile })));
    const children = childrenAt(project, 'modules', 'module').flatMap((module) =>
      module.text === undefined ? [] : [pomFileOf(basedir, module.text)],
    );
    pending.push(...children.filter((file) => !pending.includes(file)));
  }
  return modules;
}

export function lifecycleArgs(modules: readonly { readonly runsFailsafe: boolean }[]): string[] {
  return modules.some((module) => module.runsFailsafe) ? VERIFY_BUILD : ['test'];
}
