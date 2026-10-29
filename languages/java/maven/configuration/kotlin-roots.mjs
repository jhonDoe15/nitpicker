import { existsSync } from 'node:fs';
import path from 'node:path';
import { childAt, childrenAt } from '../../../../shared/ingest/common.mjs';

const KOTLIN_PLUGIN = 'org.jetbrains.kotlin:kotlin-maven-plugin';
const KOTLIN_MAIN_ROOT = 'src/main/kotlin';
const KOTLIN_TEST_ROOT = 'src/test/kotlin';

function goalConfigurations(plugin, wanted) {
  const executions = childrenAt(plugin, 'executions', 'execution').filter((execution) =>
    childrenAt(execution, 'goals', 'goal').some((goal) => goal.text === wanted),
  );
  return [plugin, ...executions]
    .map((element) => childAt(element, 'configuration'))
    .filter((configuration) => configuration !== undefined);
}

function insideModule(basedir, root) {
  const relative = path.relative(basedir, root);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function kotlinRoots({ plugins, basedir, javaRoots, goal, defaultRoot }) {
  const plugin = plugins.get(KOTLIN_PLUGIN);
  if (plugin === undefined) {
    return [];
  }
  const configured = goalConfigurations(plugin, goal)
    .flatMap((configuration) => childrenAt(configuration, 'sourceDirs', 'sourceDir'))
    .map((sourceDir) => sourceDir.text)
    .filter((text) => text !== undefined);
  const roots = (configured.length > 0 ? configured : [defaultRoot]).map((root) =>
    path.resolve(basedir, root),
  );
  return [...new Set(roots)].filter(
    (root) => !javaRoots.includes(root) && insideModule(basedir, root) && existsSync(root),
  );
}

export function kotlinSourceRoots(plugins, basedir, javaRoots) {
  return kotlinRoots({
    plugins,
    basedir,
    javaRoots,
    goal: 'compile',
    defaultRoot: KOTLIN_MAIN_ROOT,
  });
}

export function kotlinTestSourceRoots(plugins, basedir, javaRoots) {
  return kotlinRoots({
    plugins,
    basedir,
    javaRoots,
    goal: 'test-compile',
    defaultRoot: KOTLIN_TEST_ROOT,
  });
}
