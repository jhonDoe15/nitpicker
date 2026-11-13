import { describe, expect, it } from 'vitest';
import { withSharedUnusedDirectives } from './unused-directives.mjs';

const MESSAGE = "Unused eslint-disable directive (no problems were reported from 'no-console').";

const analyzers = [
  { name: 'eslint-lint', lintedGlobs: { include: ['src/**/*.ts', 'test/**/*.ts'], exclude: [] } },
  { name: 'eslint-errors', lintedGlobs: { include: ['src/**/*.ts'], exclude: ['test/**'] } },
  { name: 'eslint-logging', lintedGlobs: { include: ['src/**/*.ts'], exclude: ['test/**'] } },
  { name: 'entry-points' },
];

function unused(tool, path, line = 1) {
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

function other(tool) {
  return { tool, rule: 'no-debugger', path: 'src/a.ts', identity: 'x', message: 'x' };
}

function run(findingsByAnalyzer) {
  return {
    reports: new Map(
      Object.entries(findingsByAnalyzer).map(([name, findings]) => [name, { findings }]),
    ),
  };
}

function merged(findingsByAnalyzer) {
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
});
