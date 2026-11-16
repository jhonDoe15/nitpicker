import { isPublished, isTrue } from './configuration/publishing.mts';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type XmlElement,
  childAt,
  childrenAt,
  childrenNamed,
  parseXml,
} from '../../../shared/values/xml.mts';
import { messageOf } from '../../../shared/values/readers.mts';
import {
  type JacocoSettings,
  type ModuleLayout,
  DIRECTORY,
  configured,
  jacocoSettings,
  layoutOf,
  resolvedText,
} from './configuration/module-layout.mts';
import type { KotlinRoots } from './typed/kotlin-types.mts';
import { executionsWithGoal, pluginsOf, textAt } from './configuration/pom-elements.mts';
import { compilerSettings } from './errorprone/maven-compiler.mts';
import { kotlinRoots } from './kotlin/kotlin-roots.mts';
import { testJvmArguments } from './configuration/surefire-jvm.mts';
import { isStrictlyInside } from '../../../shared/filesystem.mjs';
import { coordinates, requiredCoordinates } from './reactor/required-coordinates.mts';

const JACOCO = 'org.jacoco:jacoco-maven-plugin';
const SUREFIRE = 'org.apache.maven.plugins:maven-surefire-plugin';
const FAILSAFE = 'org.apache.maven.plugins:maven-failsafe-plugin';

const FAILSAFE_SKIPS = ['skip', 'skipITs', 'skipTests'];
const SKIP_PROPERTIES = ['skipITs', 'skipTests'];
export type MavenModule = ModuleLayout &
  JacocoSettings & {
    readonly basedir: string;
    readonly pomFile: string;
    readonly coordinates: string;
    readonly packaging: string;
    readonly buildDirectory: string;
    readonly surefireReports: string;
    readonly failsafeReports: string;
    readonly runsFailsafe: boolean;
    readonly testJvmArgs: string[];
    readonly integrationTestJvmArgs: string[];
    readonly published: boolean;
    readonly archunitIncludes: string | undefined;
    readonly compiler: unknown;
    readonly requires: string[];
  };
export type ReactorModule = MavenModule & { readonly kotlin: KotlinRoots | undefined };
type ModuleFiles = { readonly basedir: string; readonly pomFile: string };

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

function defaultExecution(plugin: XmlElement | undefined, goal: string): XmlElement | undefined {
  const executions = plugin === undefined ? [] : executionsWithGoal(plugin, goal);
  return (
    executions.find((execution) => textAt(execution, 'id') === `default-${goal}`) ?? executions[0]
  );
}

function setting(plugin: XmlElement | undefined, goal: string, name: string): string | undefined {
  return configured(defaultExecution(plugin, goal), plugin, name);
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
    throw new Error(`Maven module ${coordinates(project)}: ${messageOf(error)}`, { cause: error });
  }
}

function describeModule(project: XmlElement, { basedir, pomFile }: ModuleFiles): MavenModule {
  const build = childAt(project, 'build');
  const plugins = pluginsOf(project);
  const buildDirectory = resolvedText(build, basedir, DIRECTORY) ?? path.join(basedir, 'target');
  const surefire = plugins.get(SUREFIRE);
  const failsafe = plugins.get(FAILSAFE);
  const reports = setting(surefire, 'test', 'reportsDirectory');
  const failsafeReports = setting(failsafe, 'integration-test', 'reportsDirectory');
  const integrationTests = defaultExecution(failsafe, 'integration-test');
  return {
    basedir,
    pomFile,
    coordinates: coordinates(project),
    packaging: packagingOf(project),
    buildDirectory,
    ...layoutOf({ build, plugins, basedir, buildDirectory }),
    surefireReports:
      reports !== undefined && reports !== ''
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
    requires: [...new Set(requiredCoordinates(project, plugins, pomFile))],
  };
}

function withKotlin(project: XmlElement, module: MavenModule): ReactorModule {
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
      return build !== undefined && isStrictlyInside(basedir, build) ? [{ project, build }] : [];
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
  modules: readonly MavenModule[],
): string {
  const basedir = path.dirname(pomFile);
  if (basedir !== projectRoot && !isStrictlyInside(projectRoot, basedir)) {
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

export function readReactor(projectRoot: string, effectivePom: string): ReactorModule[] {
  const document = parseXml(effectivePom);
  const candidates = document.name === 'projects' ? childrenNamed(document, 'project') : [document];
  const modules: ReactorModule[] = [];
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

export function lifecycleArgs(
  modules: readonly { readonly runsFailsafe: boolean }[],
): readonly string[] {
  return modules.some((module) => module.runsFailsafe) ? VERIFY_BUILD : ['test'];
}
