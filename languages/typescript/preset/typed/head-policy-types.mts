import type { NitpickerConfig } from '../../../../shared/values/config-types.mts';
import type { ProjectLibraries } from '../libraries/typed/library-types.mts';
import type { LayoutOptions, PolicyLayout } from './layout-types.mts';

type ExceptionEntry = NonNullable<NitpickerConfig['exceptions']>[number];
type ConfiguredTool = NonNullable<NonNullable<NitpickerConfig['tools']>[string]>;

export type ToolSettings = ConfiguredTool & {
  readonly engine?: string;
  readonly projectConfigDigest?: string;
  readonly projectConfigFile?: string;
  readonly projectConfigMissing?: true;
  readonly detectedRunner?: string | undefined;
  readonly snapshotRunner?: string | undefined;
};

export type ToolSettingsMap = {
  readonly prettier?: ToolSettings | undefined;
  readonly eslint?: ToolSettings | undefined;
  readonly jscpd?: ToolSettings | undefined;
  readonly typescript?: ToolSettings | undefined;
  readonly tests?: ToolSettings | undefined;
  readonly [tool: string]: ToolSettings | undefined;
};

export type ScopeSettings = { readonly enabled?: unknown; readonly [field: string]: unknown };

type Frameworks = {
  readonly defaultExports: readonly string[];
  readonly entryPoints: readonly string[];
  readonly [field: string]: unknown;
};

type PolicyLayoutOptions = LayoutOptions & {
  readonly entryPoints?: readonly string[] | undefined;
};

export type HeadConfig = Readonly<Record<string, unknown>>;

export type HeadPolicyFile = {
  readonly exclude?: readonly string[] | undefined;
  readonly layout?: PolicyLayoutOptions | undefined;
  readonly exceptions?: readonly ExceptionEntry[] | undefined;
  readonly thresholds?: Readonly<Record<string, number>> | undefined;
  readonly react?: ScopeSettings | undefined;
  readonly i18n?: ScopeSettings | undefined;
  readonly preset?: string | undefined;
  readonly tools?: ToolSettingsMap | undefined;
  readonly duplicates?: { readonly skippedFolders?: readonly string[] | undefined } | undefined;
  readonly testConsole?: unknown;
  readonly protocols?: unknown;
  readonly history?: unknown;
  readonly conventions?: Readonly<Record<string, unknown>> | undefined;
  readonly conventionPins?: unknown;
  readonly generatedFiles?: readonly string[] | undefined;
  readonly libraries?: ProjectLibraries | undefined;
  readonly frameworks?: Partial<Frameworks> | undefined;
  readonly [field: string]: unknown;
};

export type HeadPolicy = {
  readonly exclude: readonly string[];
  readonly layout: PolicyLayoutOptions;
  readonly exceptions: readonly ExceptionEntry[];
  readonly thresholds: Readonly<Record<string, number>>;
  readonly react: ScopeSettings;
  readonly i18n: ScopeSettings;
  readonly preset: string | undefined;
  readonly tools: ToolSettingsMap;
  readonly duplicates: { readonly skippedFolders?: readonly string[] | undefined };
  readonly conventions: Readonly<Record<string, unknown>> | undefined;
  readonly testConsole: unknown;
  readonly conventionPins: unknown;
  readonly generatedFiles: readonly string[];
  readonly libraries: ProjectLibraries | undefined;
  readonly frameworks: Frameworks;
  readonly history: unknown;
  readonly protocols?: unknown;
};

export type HeadLayout = PolicyLayout & { entryPoints: string[] };
