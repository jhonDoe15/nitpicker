import { fieldOf } from '../../../../../shared/values/readers.mts';

type Span = { readonly offset: number; readonly length: number };

export type OxlintDiagnostic = {
  readonly filename: string;
  readonly code?: string;
  readonly message: string;
  readonly help?: string;
  readonly labels?: readonly { readonly label?: string; readonly span: Span }[];
};

export type Position = { readonly line: number; readonly column: number };

export type LintMessage = Position & {
  readonly ruleId?: string | undefined;
  readonly messageId?: string | undefined;
  readonly message: string;
  readonly severity: number;
  readonly fatal?: true;
  readonly endLine?: number;
  readonly endColumn?: number;
};

export type LintResult = { readonly filePath: string; readonly messages: readonly LintMessage[] };

export type RuleMessages = Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;

export type PlanGroup = {
  readonly files: readonly string[];
  readonly rules: Readonly<Record<string, unknown>>;
  readonly globals?: Readonly<Record<string, string>>;
  readonly settings?: unknown;
  readonly programRules?: readonly string[];
};

export type ListedRule = {
  readonly scope: string;
  readonly value: string;
  readonly ['type_aware']: boolean;
};

export type OxlintPlan = {
  readonly groups: readonly PlanGroup[];
  readonly noInlineConfig: readonly string[];
  readonly typedPluginRules: readonly string[];
  readonly ruleMessages: RuleMessages;
  readonly nativeRules: readonly ListedRule[];
};

export type NativeRules = ReadonlyMap<string, { readonly typeAware: boolean }>;

export type PluginRequest = { readonly namespace: string; readonly alias: string };

export type BridgedPlugin = PluginRequest & { readonly ruleNames: string[] };

export type Override = {
  readonly files: readonly string[];
  readonly globals: Readonly<Record<string, string>>;
  readonly rules: Readonly<Record<string, unknown>>;
};

export type Partition = {
  readonly settings: unknown;
  readonly files: readonly string[];
  readonly overrides: readonly Override[];
};

export type ResidualGroup = {
  readonly files: readonly string[];
  readonly rules: readonly string[];
};

export type Translation = {
  readonly partitions: readonly Partition[];
  readonly residual: readonly ResidualGroup[];
  readonly ruleNames: ReadonlyMap<string, string>;
  readonly plugins: readonly BridgedPlugin[];
  readonly typeAware: boolean;
};

export type Naming = {
  readonly ruleNames: ReadonlyMap<string, string>;
  readonly messageIdOf: (ruleId: string, text: string) => string | undefined;
  readonly ruleMessages: RuleMessages;
  readonly neutralized: ReadonlyMap<string, ReadonlySet<string>>;
};

export type SpreadCheck = {
  readonly ruleId: string;
  readonly reducer: boolean;
  readonly spread: Position;
};

function isShaped(value: unknown, keys: readonly string[]): value is object {
  return typeof value === 'object' && value !== null && keys.every((key) => key in value);
}

function isPlan(value: unknown): value is OxlintPlan {
  return isShaped(value, ['groups', 'noInlineConfig', 'typedPluginRules', 'nativeRules']);
}

function isDiagnostic(value: unknown): value is OxlintDiagnostic {
  return isShaped(value, ['filename', 'message']);
}

function isLintResult(value: unknown): value is LintResult {
  return isShaped(value, ['filePath', 'messages']);
}

export function planOf(value: unknown): OxlintPlan {
  if (!isPlan(value)) {
    throw new TypeError('oxlint planning did not report a lint plan');
  }
  return value;
}

export function diagnosticsOf(report: unknown): readonly OxlintDiagnostic[] {
  const diagnostics = fieldOf(report, 'diagnostics');
  if (!(Array.isArray(diagnostics) && diagnostics.every(isDiagnostic))) {
    throw new TypeError('oxlint did not report its diagnostics');
  }
  return diagnostics;
}

export function lintResultsOf(value: unknown): readonly LintResult[] {
  if (!(Array.isArray(value) && value.every(isLintResult))) {
    throw new TypeError('ESLint did not report lint results');
  }
  return value;
}

export type SpreadReport = { readonly reducer: boolean; readonly spreadOffset: number };

export type OwnedNativeRule = {
  readonly native: string;
  readonly reportOf: (
    diagnostic: OxlintDiagnostic,
    filePath: string,
  ) => { readonly messageId: string; readonly check: SpreadReport };
  readonly checkerOf: (filePath: string, text: string) => (check: SpreadCheck) => boolean;
};

export type OwnedMessage = {
  readonly messageId: string;
  readonly message: string;
  readonly check: SpreadReport & { readonly ruleId: string };
};
