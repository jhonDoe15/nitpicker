import { existsSync } from 'node:fs';
import path from 'node:path';
import { childAt, childrenAt } from '../../ingest/common.mjs';

const KOTLIN_PLUGIN = 'kotlin-maven-plugin';
const MAIN_GOALS = ['compile', 'kapt'];
const TEST_GOALS = ['test-compile', 'test-kapt'];
const CONVENTIONAL = { main: 'src/main/kotlin', test: 'src/test/kotlin' };

function textAt(element, ...names) {
  return childAt(element, ...names)?.text?.trim();
}

export function kotlinPlugin(project) {
  return childrenAt(project, 'build', 'plugins', 'plugin').find(
    (plugin) => textAt(plugin, 'artifactId') === KOTLIN_PLUGIN,
  );
}

function directoriesOf(configuration) {
  return childrenAt(configuration ?? { children: [] }, 'sourceDirs', 'sourceDir')
    .map((element) => element.text?.trim())
    .filter((text) => text !== undefined && text !== '');
}

function configuredDirectories(plugin, goals, { pluginLevel }) {
  const executions = childrenAt(plugin, 'executions', 'execution').filter((execution) =>
    childrenAt(execution, 'goals', 'goal').some((goal) => goals.includes(goal.text)),
  );
  const own = executions.flatMap((execution) => directoriesOf(childAt(execution, 'configuration')));
  return own.length > 0 || !pluginLevel ? own : directoriesOf(childAt(plugin, 'configuration'));
}

function insideModule({ basedir, buildDirectory }, directory) {
  const within = (parent) => {
    const relative = path.relative(parent, directory);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  };
  return within(basedir) && !within(buildDirectory);
}

function existingRoots(module, candidates) {
  const roots = candidates
    .map((candidate) => path.resolve(module.basedir, candidate))
    .filter((directory) => insideModule(module, directory) && existsSync(directory));
  return [...new Set(roots)].sort();
}

export function kotlinRoots(project, module) {
  const plugin = kotlinPlugin(project);
  if (plugin === undefined) {
    return undefined;
  }
  return {
    sourceRoots: existingRoots(module, [
      ...configuredDirectories(plugin, MAIN_GOALS, { pluginLevel: true }),
      ...module.sourceRoots,
      CONVENTIONAL.main,
    ]),
    testSourceRoots: existingRoots(module, [
      ...configuredDirectories(plugin, TEST_GOALS, { pluginLevel: false }),
      ...module.testSourceRoots,
      CONVENTIONAL.test,
    ]),
  };
}
