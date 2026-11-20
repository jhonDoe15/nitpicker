import { readHeadPolicy } from '../../typed/head-policy.mts';
import { DEPENDENCY_CRUISER_TOOL } from '../../../preset/project-tools/project-config-files.mts';
import { projectToolLayer as untypedProjectToolLayer } from '../../../preset/project-tools/project-tool-policy.mts';
import { fieldOf, isPlainObject } from '../../../../../shared/values/readers.mts';
import type { ToolSettings } from '../../../preset/typed/head-policy-types.mts';
import type { CruiserConfig, GraphLayer } from './dependency-cruiser-layers.mts';

const projectToolLayer: (
  tool: string,
  settings: ToolSettings | undefined,
) => { precedence: string[] | undefined; config: Readonly<Record<string, unknown>> } | undefined =
  untypedProjectToolLayer;

function rulesOf(value: unknown): Readonly<Record<string, unknown>>[] | undefined {
  return Array.isArray(value) ? value.filter(isPlainObject) : undefined;
}

function cruiserConfigOf(config: Readonly<Record<string, unknown>>): CruiserConfig {
  const { forbidden, required, allowed, allowedSeverity, options } = config;
  const forbiddenRules = rulesOf(forbidden);
  const requiredRules = rulesOf(required);
  const allowedList: unknown[] | undefined = Array.isArray(allowed) ? allowed : undefined;
  const optionFields = isPlainObject(options) ? options : undefined;
  return {
    ...(forbiddenRules === undefined ? {} : { forbidden: forbiddenRules }),
    ...(requiredRules === undefined ? {} : { required: requiredRules }),
    ...(allowedList === undefined ? {} : { allowed: allowedList }),
    ...(allowedSeverity === undefined ? {} : { allowedSeverity }),
    ...(optionFields === undefined ? {} : { options: optionFields }),
  };
}

export function projectGraphLayer(
  { reportsConfigErrors }: { readonly reportsConfigErrors: unknown } = {
    reportsConfigErrors: false,
  },
): GraphLayer | undefined {
  const settings = readHeadPolicy().tools[DEPENDENCY_CRUISER_TOOL];
  if (reportsConfigErrors !== true && fieldOf(settings, 'projectConfigError') !== undefined) {
    return undefined;
  }
  const layer = projectToolLayer(DEPENDENCY_CRUISER_TOOL, settings);
  return layer === undefined
    ? undefined
    : { precedence: layer.precedence, config: cruiserConfigOf(layer.config) };
}
