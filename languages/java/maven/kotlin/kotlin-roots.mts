import { existsSync } from 'node:fs';
import path from 'node:path';
import { type XmlElement, childAt, childrenAt } from '../../../../shared/values/xml.mts';
import type { KotlinRoots } from '../typed/kotlin-types.mts';
import { jdkRequirements } from '../configuration/toolchain/toolchain-jdk.mts';
import { executionsOf, goalsOf, pluginsOf, textAt } from '../configuration/pom-elements.mts';
import { inside } from '../generated/generated-roots.mts';

const KOTLIN_PLUGIN = 'org.jetbrains.kotlin:kotlin-maven-plugin';
const MAIN_GOALS = ['compile', 'kapt'];
const TEST_GOALS = ['test-compile', 'test-kapt'];
const ALL_OPEN_ANNOTATION = /^all-open:annotation=(.+)$/u;
const ALL_OPEN_PRESET = /^all-open:preset=(.+)$/u;
const SPRING_PLUGIN = 'spring';

type RootsModule = {
  readonly basedir: string;
  readonly buildDirectory: string;
  readonly sourceRoots: readonly string[];
  readonly testSourceRoots: readonly string[];
};

function runs(execution: XmlElement, goals: readonly string[]): boolean {
  return (
    textAt(execution, 'phase') !== 'none' &&
    goalsOf(execution).some((goal) => goal !== undefined && goals.includes(goal))
  );
}

function isPresent(text: string | undefined): text is string {
  return text !== undefined && text !== '';
}

function directoriesOf(configuration: XmlElement | undefined): string[] {
  return childrenAt(configuration, 'sourceDirs', 'sourceDir')
    .map((element) => element.text)
    .filter(isPresent);
}

function configuredDirectories(
  plugin: XmlElement,
  goals: readonly string[],
  { pluginLevel }: { readonly pluginLevel: boolean },
): string[] {
  const own = executionsOf(plugin)
    .filter((execution) => runs(execution, goals))
    .flatMap((execution) => directoriesOf(childAt(execution, 'configuration')));
  return own.length > 0 || !pluginLevel ? own : directoriesOf(childAt(plugin, 'configuration'));
}

function configurationsOf(plugin: XmlElement, goals: readonly string[]): XmlElement[] {
  return executionsOf(plugin)
    .filter((execution) => runs(execution, goals))
    .map((execution) => childAt(execution, 'configuration'))
    .filter((configuration) => configuration !== undefined);
}

function textsAt(configurations: readonly XmlElement[], ...names: readonly string[]): string[] {
  return configurations
    .flatMap((configuration) => childrenAt(configuration, ...names))
    .map((element) => element.text?.trim())
    .filter(isPresent);
}

function optionValues(options: readonly string[], pattern: RegExp): string[] {
  return options.flatMap((option) => pattern.exec(option)?.[1]?.trim() ?? []);
}

function allOpenOf(plugin: XmlElement): KotlinRoots['allOpen'] {
  const configurations = configurationsOf(plugin, ['compile']);
  const options = textsAt(configurations, 'pluginOptions', 'option');
  const springPlugin = textsAt(configurations, 'compilerPlugins', 'plugin').includes(SPRING_PLUGIN);
  return {
    annotations: [...new Set(optionValues(options, ALL_OPEN_ANNOTATION))],
    presets: [
      ...new Set([
        ...optionValues(options, ALL_OPEN_PRESET),
        ...(springPlugin ? [SPRING_PLUGIN] : []),
      ]),
    ],
  };
}

function insideModule({ basedir, buildDirectory }: RootsModule, directory: string): boolean {
  return inside(basedir, directory) && !inside(buildDirectory, directory);
}

function outermost(directories: readonly string[]): string[] {
  return directories.filter(
    (directory) => !directories.some((other) => other !== directory && inside(other, directory)),
  );
}

function existingRoots(module: RootsModule, candidates: readonly string[]): string[] {
  const roots = candidates
    .map((candidate) => path.resolve(module.basedir, candidate))
    .filter((directory) => insideModule(module, directory) && existsSync(directory));
  return outermost([...new Set(roots)]).sort();
}

function compiledRoots(
  module: RootsModule,
  configured: readonly string[],
  mavenRoots: readonly string[],
): string[] {
  return existingRoots(module, configured.length > 0 ? configured : mavenRoots);
}

export function kotlinRoots(project: XmlElement, module: RootsModule): KotlinRoots | undefined {
  const plugin = pluginsOf(project).get(KOTLIN_PLUGIN);
  if (
    plugin === undefined ||
    !executionsOf(plugin).some((execution) => runs(execution, [...MAIN_GOALS, ...TEST_GOALS]))
  ) {
    return undefined;
  }
  return {
    jdkToolchain: jdkRequirements(project),
    allOpen: allOpenOf(plugin),
    sourceRoots: compiledRoots(
      module,
      configuredDirectories(plugin, MAIN_GOALS, { pluginLevel: true }),
      module.sourceRoots,
    ),
    testSourceRoots: compiledRoots(
      module,
      configuredDirectories(plugin, TEST_GOALS, { pluginLevel: false }),
      module.testSourceRoots,
    ),
  };
}
