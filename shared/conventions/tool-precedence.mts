import { existsSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, textsOf } from '../values/readers.mts';
import { TROUBLESHOOTING_ANCHORS, withTroubleshooting } from '../messages/troubleshooting.mts';

const NITPICKER = 'nitpicker';

export const JSCPD_PROJECT_FILE = '.jscpd.json';

type ToolPrecedence = { readonly precedence?: readonly string[] | undefined };
type PrecedenceLayers = { readonly usesProject: boolean; readonly nitpickerFirst: boolean };

export function precedenceLayers(precedence: readonly string[] = [NITPICKER]): PrecedenceLayers {
  const project = precedence.indexOf('project');
  const nitpicker = precedence.indexOf(NITPICKER);
  return { usesProject: project !== -1, nitpickerFirst: nitpicker !== -1 && nitpicker < project };
}

export function usesConfigRetries(toolPrecedence: unknown): boolean {
  const tests = fieldOf(toolPrecedence, 'tests');
  const layers = precedenceLayers(Array.isArray(tests) ? textsOf(tests) : undefined);
  return layers.usesProject && !layers.nitpickerFirst;
}

function shownSetting(value: unknown): string {
  return Array.isArray(value)
    ? `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
    : JSON.stringify(value);
}

function projectOptIn(tool: string, settings: Readonly<Record<string, unknown>>): string {
  const merged = { ...settings, precedence: ['project', NITPICKER] };
  const shown = Object.entries(merged).map(([key, value]) => `"${key}": ${shownSetting(value)}`);
  return `"tools": { "${tool}": { ${shown.join(', ')} } }`;
}

export function missingProjectConfig(tool: string, looked: string): string {
  return withTroubleshooting(
    `"tools.${tool}.precedence" lists "project" but ${looked} is missing: create it, or remove "project" from tools.${tool}.precedence`,
    TROUBLESHOOTING_ANCHORS.projectToolConfigMissing,
  );
}

export function ignoredConfigNotice(
  ignored: string,
  tool: string,
  settings: Readonly<Record<string, unknown>> = {},
): string {
  return `Ignoring ${ignored}; opt in with ${projectOptIn(tool, settings)}`;
}

export function jscpdIgnoredNotices(
  config: { readonly tools?: { readonly [tool: string]: ToolPrecedence | undefined } },
  projectRoot: string,
): string[] {
  return existsSync(path.join(projectRoot, JSCPD_PROJECT_FILE)) &&
    !precedenceLayers(config.tools?.['jscpd']?.precedence).usesProject
    ? [ignoredConfigNotice(JSCPD_PROJECT_FILE, 'jscpd')]
    : [];
}
