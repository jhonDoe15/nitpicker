import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../shared/messages/troubleshooting.mjs';
import { textOf } from '../../../../shared/values/readers.mts';
import { isTable } from '../configuration/project-files.mts';
import type {
  Attempt,
  ProjectConfigRequest,
  TomlTable,
  ToolContext,
  ToolLayers,
} from './typed/tool-types.mts';
import { parseTomlText, stringifyTomlValue } from './typed/toml-module.mts';

export function parseToml(text: string): TomlTable {
  const table: unknown = parseTomlText(text);
  return isTable(table) ? table : {};
}

export function stringifyToml(value: unknown): string {
  return textOf(stringifyTomlValue(value));
}

export function attempt<T>(read: () => T): Attempt<T> {
  try {
    return { value: read() };
  } catch (error) {
    return { error };
  }
}

export function toolLayers(context: ToolContext, tool: string): ToolLayers {
  const layers = precedenceLayers(context.toolPrecedence?.[tool]);
  return {
    optedIn: layers.usesProject,
    appliesProject: layers.usesProject && !layers.nitpickerFirst,
    nitpickerFirst: layers.nitpickerFirst,
    configRoot: layers.usesProject
      ? (context.policyRoot ?? context.projectRoot)
      : context.projectRoot,
  };
}

export function requireProjectConfig<T extends { file: string; unreadable?: string | undefined }>(
  found: T | undefined,
  { tool, looked, configRoot }: ProjectConfigRequest,
): T {
  if (found === undefined) {
    throw new Error(textOf(missingProjectConfig(tool, `${looked} (searched ${configRoot})`)));
  }
  if (found.unreadable !== undefined) {
    throw troubleshootingError(
      [
        `The ${tool} config ${found.file} could not be parsed (${found.unreadable}):`,
        `fix it, or remove "project" from tools.${tool}.precedence`,
      ].join(' '),
      TROUBLESHOOTING_ANCHORS.projectToolConfigMissing,
    );
  }
  return found;
}

export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
