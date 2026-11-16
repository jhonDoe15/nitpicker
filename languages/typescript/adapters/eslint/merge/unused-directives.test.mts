import { describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { withSharedUnusedDirectives } from './unused-directives.mts';

const MESSAGE = "Unused eslint-disable directive (no problems were reported from 'no-console').";

const analyzers = [
  { name: 'eslint-lint', lintedGlobs: { include: ['src/**/*.ts', 'test/**/*.ts'], exclude: [] } },
  { name: 'eslint-errors', lintedGlobs: { include: ['src/**/*.ts'], exclude: ['test/**'] } },
  { name: 'eslint-logging', lintedGlobs: { include: ['src/**/*.ts'], exclude: ['test/**'] } },
  { name: 'entry-points' },
];

function unused(tool: string, path: string, line = 1): Finding {
  return {
    tool,
    rule: 'eslint/unused-disable-directive',
    path,
    identity: `message:${MESSAGE}|occurrence:1`,
    message: MESSAGE,
    classification: 'enforceable',
    location: { line, column: 1 },
  };
}

function other(tool: string): Finding {
  return {
    tool,
    rule: 'no-debugger',
    path: 'src/a.ts',
    identity: 'x',
    message: 'x',
    classification: 'enforceable',
  };
}

function unusedRules(tool: string, rules: readonly string[]): Finding {
  const quoted = rules.map((rule) => `'${rule}'`).join(' or ');
  const message = `Unused eslint-disable directive (no problems were reported from ${quoted}).`;
  return { ...unused(tool, 'src/a.ts'), message, identity: `message:${message}|occurrence:1` };
}

function inlineDisabled(tool: string): Finding {
  return {
    ...unused(tool, 'src/a.ts'),
    rule: 'eslint/inline-config-disabled',
    message: 'Inline configuration is disabled.',
  };
}

function run(findingsByAnalyzer: Readonly<Record<string, readonly Finding[]>>) {
  return {
    reports: new Map(
      Object.entries(findingsByAnalyzer).map(([name, findings]) => [name, { findings }]),
    ),
  };
}

function merged(findingsByAnalyzer: Readonly<Record<string, readonly Finding[]>>) {
  return Object.fromEntries(
    [...withSharedUnusedDirectives(run(findingsByAnalyzer), analyzers).reports].map(
      ([name, report]) => [name, report.findings.map(({ rule, path }) => `${rule} ${path}`)],
    ),
  );
}

describe('an unused eslint-disable directive reported by several ESLint analyzers', () => {
  it('is reported once when every analyzer that lints the file reports it', () => {
    const result = merged({
      'eslint-lint': [unused('eslint-lint', 'src/a.ts')],
      'eslint-errors': [unused('eslint-errors', 'src/a.ts')],
      'eslint-logging': [unused('eslint-logging', 'src/a.ts')],
    });

    expect(result).toEqual({
      'eslint-lint': ['eslint/unused-disable-directive src/a.ts'],
      'eslint-errors': [],
      'eslint-logging': [],
    });
  });

  it('is reported by the first analyzer by name when eslint-lint did not run', () => {
    const result = merged({
      'eslint-logging': [unused('eslint-logging', 'src/a.ts')],
      'eslint-errors': [unused('eslint-errors', 'src/a.ts')],
    });

    expect(result).toEqual({
      'eslint-logging': [],
      'eslint-errors': ['eslint/unused-disable-directive src/a.ts'],
    });
  });

  it('is dropped when another analyzer that lints the file used it', () => {
    const result = merged({
      'eslint-lint': [unused('eslint-lint', 'src/a.ts')],
      'eslint-errors': [unused('eslint-errors', 'src/a.ts')],
      'eslint-logging': [],
    });

    expect(result).toEqual({ 'eslint-lint': [], 'eslint-errors': [], 'eslint-logging': [] });
  });

  it('stays when the analyzers that do not lint the file are silent', () => {
    const result = merged({
      'eslint-lint': [unused('eslint-lint', 'test/a.ts')],
      'eslint-errors': [],
      'eslint-logging': [],
    });

    expect(result['eslint-lint']).toEqual(['eslint/unused-disable-directive test/a.ts']);
  });

  it('keeps two directives on different lines and every other finding', () => {
    const result = merged({
      'eslint-lint': [unused('eslint-lint', 'src/a.ts', 1), unused('eslint-lint', 'src/a.ts', 5)],
      'eslint-errors': [
        unused('eslint-errors', 'src/a.ts', 1),
        unused('eslint-errors', 'src/a.ts', 5),
        other('eslint-errors'),
      ],
      'eslint-logging': [
        unused('eslint-logging', 'src/a.ts', 1),
        unused('eslint-logging', 'src/a.ts', 5),
      ],
    });

    expect(result['eslint-lint']).toHaveLength(2);
    expect(result['eslint-errors']).toEqual(['no-debugger src/a.ts']);
  });

  it('leaves a run with no ESLint analyzer as it is', () => {
    const original = run({ 'entry-points': [other('entry-points')] });

    expect(withSharedUnusedDirectives(original, analyzers)).toBe(original);
  });

  it('ignores an analyzer that forbids the directive rather than treating it as used', () => {
    const result = merged({
      'eslint-lint': [inlineDisabled('eslint-lint')],
      'eslint-errors': [unused('eslint-errors', 'src/a.ts')],
      'eslint-logging': [unused('eslint-logging', 'src/a.ts')],
    });

    expect(result).toEqual({
      'eslint-lint': ['eslint/inline-config-disabled src/a.ts'],
      'eslint-errors': ['eslint/unused-disable-directive src/a.ts'],
      'eslint-logging': [],
    });
  });

  it('keeps only the rules unused across analyzers when their messages differ', () => {
    const result = withSharedUnusedDirectives(
      run({
        'eslint-errors': [unusedRules('eslint-errors', ['no-debugger'])],
        'eslint-logging': [unusedRules('eslint-logging', ['no-debugger', 'no-console'])],
      }),
      analyzers,
    );

    expect(result.reports.get('eslint-errors')?.findings).toEqual([
      unusedRules('eslint-errors', ['no-debugger']),
    ]);
    expect(result.reports.get('eslint-logging')?.findings).toEqual([]);
  });

  it('drops a multi-rule directive when each rule is used by at least one analyzer', () => {
    const result = merged({
      'eslint-errors': [unusedRules('eslint-errors', ['no-console'])],
      'eslint-logging': [unusedRules('eslint-logging', ['no-debugger'])],
    });

    expect(result).toEqual({ 'eslint-errors': [], 'eslint-logging': [] });
  });

  it('combines individual unused-rule reports and updates the canonical finding identity', () => {
    const result = withSharedUnusedDirectives(
      run({
        'eslint-errors': [
          unusedRules('eslint-errors', ['no-debugger']),
          unusedRules('eslint-errors', ['no-alert']),
        ],
        'eslint-logging': [unusedRules('eslint-logging', ['no-alert', 'no-console'])],
      }),
      analyzers,
    );

    expect(result.reports.get('eslint-errors')?.findings).toEqual([
      unusedRules('eslint-errors', ['no-alert']),
    ]);
    expect(result.reports.get('eslint-logging')?.findings).toEqual([]);
  });
});
