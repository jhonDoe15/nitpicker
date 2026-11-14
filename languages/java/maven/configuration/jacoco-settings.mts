import path from 'node:path';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import type { ModuleBase } from '../typed/module-description.mts';
import { executionsWithGoal, textAt } from '../typed/pom-values.mts';

export const JACOCO = 'org.jacoco:jacoco-maven-plugin';
const AGENT_GOALS = ['prepare-agent', 'prepare-agent-integration'];

export function configured(
  execution: XmlElement | undefined,
  plugin: XmlElement | undefined,
  name: string,
): string | undefined {
  return textAt(execution, 'configuration', name) ?? textAt(plugin, 'configuration', name);
}

function jacocoDestFiles(plugin: XmlElement | undefined, basedir: string): string[] {
  const executions =
    plugin === undefined ? [] : AGENT_GOALS.flatMap((goal) => executionsWithGoal(plugin, goal));
  const files = executions.flatMap((execution) => configured(execution, plugin, 'destFile') ?? []);
  return [...new Set(files.map((file) => path.resolve(basedir, file)))];
}

function jacocoAgentVersion(plugin: XmlElement | undefined): string | undefined {
  const version = plugin === undefined ? undefined : textAt(plugin, 'version')?.trim();
  const agents = (
    plugin === undefined ? [] : AGENT_GOALS.flatMap((goal) => executionsWithGoal(plugin, goal))
  ).filter((execution) => textAt(execution, 'phase') !== 'none');
  return agents.length === 0 || version === undefined || version.includes('${')
    ? undefined
    : version;
}

export function jacocoSettings(
  plugin: XmlElement | undefined,
  basedir: string,
): Pick<ModuleBase, 'jacocoDestFiles' | 'jacocoAgentVersion'> {
  return {
    jacocoDestFiles: jacocoDestFiles(plugin, basedir),
    jacocoAgentVersion: jacocoAgentVersion(plugin),
  };
}
