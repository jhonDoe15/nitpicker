import { toolsOf as untypedToolsOf } from '../../../shared/exceptions/rule-tools.mts';
import { THRESHOLD_PRESETS as untypedThresholdPresets } from '../../../shared/config.mts';
import { CO_CHANGE_DEFAULTS as untypedCoChangeDefaults } from '../../../shared/project-rules/hygiene-rules.mts';

export type SchemaTable = Readonly<Record<string, { readonly [keyword: string]: unknown }>>;

export type TextTable = Readonly<Record<string, string>>;

export const CO_CHANGE_DEFAULTS: Readonly<Record<string, number>> = untypedCoChangeDefaults;

export const toolsOf: (rule: string) => readonly string[] | undefined = untypedToolsOf;

export const THRESHOLD_PRESETS: Readonly<Record<string, readonly string[]>> =
  untypedThresholdPresets;
