import { childAt, childrenAt } from '../../../../shared/ingest/common.mjs';

export const CONFIGURATION = 'configuration';
export const PROPERTIES = 'properties';
export { childAt as child, childrenAt as all };

export function textAt(element, ...names) {
  return childAt(element, ...names)?.text;
}

export function pluginsOf(project) {
  return new Map(
    childrenAt(project, 'build', 'plugins', 'plugin').map((plugin) => [
      `${textAt(plugin, 'groupId') ?? 'org.apache.maven.plugins'}:${textAt(plugin, 'artifactId')}`,
      plugin,
    ]),
  );
}

export function executionsWithGoal(plugin, goal) {
  return childrenAt(plugin, 'executions', 'execution').filter((execution) =>
    childrenAt(execution, 'goals', 'goal').some((element) => element.text === goal),
  );
}

export function configured(execution, plugin, name) {
  return textAt(execution, CONFIGURATION, name) ?? textAt(plugin, CONFIGURATION, name);
}
