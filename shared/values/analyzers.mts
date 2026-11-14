import { fieldOf, textOf } from './readers.mts';

export type Analyzer = {
  readonly name: string;
  readonly publishesModuleImports?: unknown;
  readonly exclusions?: unknown;
  readonly [field: string]: unknown;
};

type Invocation = {
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export function analyzerNameOf(analyzer: unknown): string {
  return textOf(fieldOf(analyzer, 'name'));
}

export type ProfiledAnalyzer = {
  readonly name: string;
  readonly custom?: unknown;
  readonly configurationHash?: unknown;
  readonly resolveConfigurationHash?: (root: string) => unknown;
  readonly createInvocation: (context: unknown) => Invocation;
  readonly dependencies?: readonly string[];
  readonly quick?: true;
};

function isAnalyzer(value: unknown): value is Analyzer {
  return (
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
  );
}

export function analyzersOf(value: unknown): Analyzer[] {
  return Array.isArray(value) ? value.filter(isAnalyzer) : [];
}
