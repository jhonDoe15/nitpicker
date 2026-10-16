import { childrenNamed } from '../../ingest/common.mjs';

export const CONFIGURATION = 'configuration';
export const PROPERTIES = 'properties';

export function child(element, ...names) {
  return names.reduce((current, name) => current && childrenNamed(current, name)[0], element);
}

export function textAt(element, ...names) {
  return child(element, ...names)?.text;
}

export function all(element, ...names) {
  const parent = child(element, ...names.slice(0, -1));
  return parent === undefined ? [] : childrenNamed(parent, names.at(-1));
}

export function pluginsOf(project) {
  return new Map(
    all(project, 'build', 'plugins', 'plugin').map((plugin) => [
      `${textAt(plugin, 'groupId') ?? 'org.apache.maven.plugins'}:${textAt(plugin, 'artifactId')}`,
      plugin,
    ]),
  );
}

export function executionsWithGoal(plugin, goal) {
  return all(plugin, 'executions', 'execution').filter((execution) =>
    all(execution, 'goals', 'goal').some((element) => element.text === goal),
  );
}

export function configured(execution, plugin, name) {
  return textAt(execution, CONFIGURATION, name) ?? textAt(plugin, CONFIGURATION, name);
}
