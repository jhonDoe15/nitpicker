import { existsSync } from 'node:fs';
import path from 'node:path';
import { childAt, childrenAt } from '../../../../shared/ingest/common.mjs';
import { jdkRequirements } from '../configuration/toolchain-jdk.mjs';
import { executionsOf, goalsOf, pluginsOf, textAt } from '../configuration/pom-elements.mjs';

const KOTLIN_PLUGIN = 'org.jetbrains.kotlin:kotlin-maven-plugin';
const MAIN_GOALS = ['compile', 'kapt'];
const TEST_GOALS = ['test-compile', 'test-kapt'];
const ALL_OPEN_ANNOTATION = /^all-open:annotation=(.+)$/u;
const ALL_OPEN_PRESET = /^all-open:preset=(.+)$/u;
const SPRING_PLUGIN = 'spring';

function runs(execution, goals) {
  return (
    textAt(execution, 'phase') !== 'none' && goalsOf(execution).some((goal) => goals.includes(goal))
  );
}

function directoriesOf(configuration) {
  return childrenAt(configuration ?? { children: [] }, 'sourceDirs', 'sourceDir')
    .map((element) => element.text)
    .filter((text) => text !== undefined && text !== '');
}

function configuredDirectories(plugin, goals, { pluginLevel }) {
  const own = executionsOf(plugin)
    .filter((execution) => runs(execution, goals))
    .flatMap((execution) => directoriesOf(childAt(execution, 'configuration')));
  return own.length > 0 || !pluginLevel ? own : directoriesOf(childAt(plugin, 'configuration'));
}

function configurationsOf(plugin, goals) {
  const own = executionsOf(plugin)
    .filter((execution) => runs(execution, goals))
    .map((execution) => childAt(execution, 'configuration'))
    .filter((configuration) => configuration !== undefined);
  const pluginLevel = childAt(plugin, 'configuration');
  return own.length > 0 || pluginLevel === undefined ? own : [pluginLevel];
}

function textsOf(configurations, ...path) {
  return configurations
    .flatMap((configuration) => childrenAt(configuration, ...path))
    .map((element) => element.text?.trim())
    .filter((text) => text !== undefined && text !== '');
}

function optionValues(options, pattern) {
  return options.flatMap((option) => pattern.exec(option)?.[1].trim() ?? []);
}

function allOpenOf(plugin) {
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

function within(parent, directory) {
  const relative = path.relative(parent, directory);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function insideModule({ basedir, buildDirectory }, directory) {
  return within(basedir, directory) && !within(buildDirectory, directory);
}

function outermost(directories) {
  return directories.filter(
    (directory) => !directories.some((other) => other !== directory && within(other, directory)),
  );
}

function existingRoots(module, candidates) {
  const roots = candidates
    .map((candidate) => path.resolve(module.basedir, candidate))
    .filter((directory) => insideModule(module, directory) && existsSync(directory));
  return outermost([...new Set(roots)]).sort();
}

function compiledRoots(module, configured, mavenRoots) {
  return existingRoots(module, configured.length > 0 ? configured : mavenRoots);
}

export function kotlinRoots(project, module) {
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
