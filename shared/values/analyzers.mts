export type Analyzer = {
  readonly name: string;
  readonly publishesModuleImports?: unknown;
  readonly exclusions?: unknown;
  readonly [field: string]: unknown;
};

function isAnalyzer(value: unknown): value is Analyzer {
  return (
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
  );
}

export function analyzersOf(value: unknown): Analyzer[] {
  return Array.isArray(value) ? value.filter(isAnalyzer) : [];
}
