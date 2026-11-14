export function finding(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    tool: 'fake-quality-analyzer',
    rule: 'fixture-rule',
    identity: 'fixture-identity',
    message: 'Fixture finding',
    classification: 'enforceable',
    ...overrides,
  };
}

export function findingLine(value: unknown, marker = 'QUALITY_FINDING'): string {
  return `// ${marker} ${JSON.stringify(value)}\n`;
}

export function policy(overrides: Readonly<Record<string, unknown>> = {}): string {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING', ...overrides }, null, 2)}\n`;
}
