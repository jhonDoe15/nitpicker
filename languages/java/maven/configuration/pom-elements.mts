import { type XmlElement, childAt, childrenAt } from '../../../../shared/values/xml.mts';

export function textAt(
  element: XmlElement | undefined,
  ...names: readonly string[]
): string | undefined {
  return childAt(element, ...names)?.text;
}

export function pluginsOf(project: XmlElement | undefined): Map<string, XmlElement> {
  return new Map(
    childrenAt(project, 'build', 'plugins', 'plugin').map((plugin) => [
      `${textAt(plugin, 'groupId') ?? 'org.apache.maven.plugins'}:${String(textAt(plugin, 'artifactId'))}`,
      plugin,
    ]),
  );
}

export function executionsOf(plugin: XmlElement | undefined): XmlElement[] {
  return childrenAt(plugin, 'executions', 'execution');
}

export function goalsOf(execution: XmlElement): (string | undefined)[] {
  return childrenAt(execution, 'goals', 'goal').map((element) => element.text);
}

export function executionsWithGoal(plugin: XmlElement | undefined, goal: string): XmlElement[] {
  return executionsOf(plugin).filter((execution) => goalsOf(execution).includes(goal));
}
