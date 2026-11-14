import { existsSync } from 'node:fs';
import path from 'node:path';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import {
  type JdkRequirements,
  jdkRequirements,
} from '../configuration/toolchain/toolchain-jdk.mts';
import {
  childAt,
  childrenAt,
  executionsOf,
  goalsOf,
  pluginsOf,
  textAt,
} from '../typed/pom-values.mts';

export type KotlinRoots = {
  readonly jdkToolchain: JdkRequirements | undefined;
  readonly allOpen: { readonly annotations: string[]; readonly presets: string[] };
  readonly sourceRoots: string[];
  readonly testSourceRoots: string[];
};
type RootsModule = {
  readonly basedir: string;
  readonly buildDirectory: string;
  readonly sourceRoots: readonly string[];
  readonly testSourceRoots: readonly string[];
};

const KOTLIN_PLUGIN = 'org.jetbrains.kotlin:kotlin-maven-plugin';
const MAIN_GOALS = ['compile', 'kapt'];
const TEST_GOALS = ['test-compile', 'test-kapt'];
const ALL_OPEN_ANNOTATION = /^all-open:annotation=(.+)$/u;
const ALL_OPEN_PRESET = /^all-open:preset=(.+)$/u;
const SPRING_PLUGIN = 'spring';

function runs(execution: XmlElement, goals: readonly string[]): boolean {
  return (
    textAt(execution, 'phase') !== 'none' &&
    goalsOf(execution).some((goal) => goals.includes(goal ?? ''))
  );
}

function directoriesOf(configuration: XmlElement | undefined): string[] {
  return childrenAt(configuration, 'sourceDirs', 'sourceDir').flatMap(({ text }) =>
    text === undefined || text === '' ? [] : [text],
  );
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
    .flatMap((execution) => childAt(execution, 'configuration') ?? []);
}

function textsOf(configurations: readonly XmlElement[], ...path: string[]): string[] {
  return configurations
    .flatMap((configuration) => childrenAt(configuration, ...path))
    .flatMap((element) => {
      const text = element.text?.trim();
      return text === undefined || text === '' ? [] : [text];
    });
}

function optionValues(options: readonly string[], pattern: RegExp): string[] {
  return options.flatMap((option) => pattern.exec(option)?.[1]?.trim() ?? []);
}

function allOpenOf(plugin: XmlElement): KotlinRoots['allOpen'] {
  const configurations = configurationsOf(plugin, ['compile']);
  const options = textsOf(configurations, 'pluginOptions', 'option');
  const springPlugin = textsOf(configurations, 'compilerPlugins', 'plugin').includes(SPRING_PLUGIN);
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

function within(parent: string, directory: string): boolean {
  const relative = path.relative(parent, directory);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function insideModule({ basedir, buildDirectory }: RootsModule, directory: string): boolean {
  return within(basedir, directory) && !within(buildDirectory, directory);
}

function outermost(directories: readonly string[]): string[] {
  return directories.filter(
    (directory) => !directories.some((other) => other !== directory && within(other, directory)),
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
  const compiles =
    plugin !== undefined &&
    executionsOf(plugin).some((execution) => runs(execution, [...MAIN_GOALS, ...TEST_GOALS]));
  if (!compiles) {
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
