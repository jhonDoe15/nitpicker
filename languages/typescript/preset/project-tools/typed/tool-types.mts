import type { NitpickerConfig } from '../../../../../shared/values/config-types.mts';
import type { AppliedValues } from '../../../../../core/policy-changes/types/policy-types.mts';
import type { Fields } from '../../../../../shared/values/readers.mts';

export type ToolValues = Fields;

export type PrecedenceLayers = Readonly<Record<'usesProject' | 'nitpickerFirst', boolean>>;

export type ToolSettings = NonNullable<NonNullable<NitpickerConfig['tools']>[string]>;

export type ToolsMap = { readonly [tool: string]: ToolSettings | undefined };

export type ToolPolicy = {
  readonly tools?: ToolsMap | undefined;
  readonly disable?: readonly string[] | undefined;
  readonly [field: string]: unknown;
};

export type AppliedChange = AppliedValues;

export type ToolEntry = {
  readonly files: readonly string[];
  readonly packageKey?: string;
  readonly analyzers: readonly string[];
  readonly json: { readonly pattern: RegExp; readonly strict: boolean };
};

export type JsoncResult =
  | { readonly kind: 'json'; readonly value: unknown; readonly reason?: undefined }
  | { readonly kind: 'malformed'; readonly reason: string; readonly value?: undefined };

export type ProjectConfigSources = {
  readonly file: string | undefined;
  readonly section: JsoncResult;
  readonly label: string;
};

export type ProjectEvaluation =
  | { readonly kind: 'missing'; readonly message: string }
  | { readonly kind: 'config'; readonly config: ToolValues; readonly files: string[] }
  | { readonly kind: 'error'; readonly message: string };
