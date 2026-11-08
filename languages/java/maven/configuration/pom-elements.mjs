import { childAt, childrenAt } from '../../../../shared/ingest/common.mjs';

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

export function executionsOf(plugin) {
  return childrenAt(plugin, 'executions', 'execution');
}

export function goalsOf(execution) {
  return childrenAt(execution, 'goals', 'goal').map((element) => element.text);
}

export function executionsWithGoal(plugin, goal) {
  return executionsOf(plugin).filter((execution) => goalsOf(execution).includes(goal));
}
