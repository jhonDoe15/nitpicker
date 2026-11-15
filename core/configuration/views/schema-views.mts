import { toolsOf as untypedToolsOf } from '../../../shared/exceptions/rule-tools.mjs';
import { THRESHOLD_PRESETS as untypedThresholdPresets } from '../../../shared/config.mjs';
import { CO_CHANGE_DEFAULTS as untypedCoChangeDefaults } from '../../../shared/project-rules/hygiene-rules.mjs';

export type SchemaTable = Readonly<Record<string, { readonly [keyword: string]: unknown }>>;

export type TextTable = Readonly<Record<string, string>>;

export const CO_CHANGE_DEFAULTS: Readonly<Record<string, number>> = untypedCoChangeDefaults;

export const toolsOf: (rule: string) => readonly string[] | undefined = untypedToolsOf;

export const THRESHOLD_PRESETS: Readonly<Record<string, readonly string[]>> =
  untypedThresholdPresets;
