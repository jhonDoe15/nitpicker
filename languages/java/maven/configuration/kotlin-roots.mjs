import { existsSync } from 'node:fs';
import path from 'node:path';
import { childAt, childrenAt } from '../../../../shared/ingest/common.mjs';

const KOTLIN_PLUGIN = 'org.jetbrains.kotlin:kotlin-maven-plugin';
const KOTLIN_MAIN_ROOT = 'src/main/kotlin';

function compileConfigurations(plugin) {
  const executions = childrenAt(plugin, 'executions', 'execution').filter((execution) =>
    childrenAt(execution, 'goals', 'goal').some((goal) => goal.text === 'compile'),
  );
  return [plugin, ...executions]
    .map((element) => childAt(element, 'configuration'))
    .filter((configuration) => configuration !== undefined);
}

function insideModule(basedir, root) {
  const relative = path.relative(basedir, root);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function kotlinSourceRoots(plugins, basedir, javaRoots) {
  const plugin = plugins.get(KOTLIN_PLUGIN);
  if (plugin === undefined) {
    return [];
  }
  const configured = compileConfigurations(plugin)
    .flatMap((configuration) => childrenAt(configuration, 'sourceDirs', 'sourceDir'))
    .map((sourceDir) => sourceDir.text)
    .filter((text) => text !== undefined);
  const roots = (configured.length > 0 ? configured : [KOTLIN_MAIN_ROOT]).map((root) =>
    path.resolve(basedir, root),
  );
  return [...new Set(roots)].filter(
    (root) => !javaRoots.includes(root) && insideModule(basedir, root) && existsSync(root),
  );
}
