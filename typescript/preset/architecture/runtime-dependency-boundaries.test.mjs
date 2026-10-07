import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeRuntimeBoundaries,
  inspectModuleBoundary,
} from './runtime-dependency-boundaries.mjs';

const temporaryRoots = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const role = {
  name: 'decision-policy',
  modules: ['**/*-policy.ts'],
  forbiddenDependencies: ['instrumentation', 'instrumentation/**', '**/logger.*'],
  forbiddenCalls: ['setTimeout', 'globalThis.setTimeout', 'process.exit'],
};

function inspect(source, selectedRole = role) {
  return inspectModuleBoundary(source, 'domain/decision-policy.ts', selectedRole);
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'module-role-boundaries-'));
  temporaryRoots.push(root);
  for (const [name, source] of Object.entries(files)) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return root;
}

describe('runtime dependency boundaries', () => {
  it('checks runtime imports, re-exports, dynamic imports and CommonJS dependencies', () => {
    const findings = inspect(`
      import { counter } from 'instrumentation';
      export { trace } from 'instrumentation/tracing';
      void import('../shared/logger.js');
      const logger = require('instrumentation/logging');
      import legacyLogger = require('instrumentation/legacy');
    `);
    expect(findings.map((finding) => finding.target)).toEqual([
      'instrumentation',
      'instrumentation/tracing',
      '../shared/logger.js',
      'instrumentation/logging',
      'instrumentation/legacy',
    ]);
    expect(findings.every((finding) => finding.rule === 'forbidden-runtime-dependency')).toBe(true);
  });

  it('allows type-only imports and exports, including inline type modifiers', () => {
    expect(
      inspect(`
      import type { Logger } from 'instrumentation';
      import { type Span, type Meter } from 'instrumentation/tracing';
      export type { Logger } from 'instrumentation';
      export { type Span } from 'instrumentation/tracing';
      import { decide } from './decide.js';
    `),
    ).toEqual([]);
    expect(inspect("import { type Logger, counter } from 'instrumentation';")).toHaveLength(1);
    expect(inspect("import 'instrumentation';")).toHaveLength(1);
  });

  it('checks forbidden global calls and statically named property access', () => {
    const findings = inspect(`
      setTimeout(() => {}, 1);
      globalThis['setTimeout'](() => {}, 1);
      process.exit(1);
      injectedClock.schedule(() => {}, 1);
    `);
    expect(findings.map((finding) => finding.target)).toEqual([
      'setTimeout',
      'globalThis.setTimeout',
      'process.exit',
    ]);
    expect(findings.every((finding) => finding.line > 0 && finding.column > 0)).toBe(true);
  });

  it('reports unresolved dynamic dependencies instead of silently skipping the boundary', () => {
    expect(inspect('void import(pluginName);')).toMatchObject([
      { rule: 'unresolved-runtime-dependency', target: 'import' },
    ]);
    expect(inspect('require(moduleName);')).toMatchObject([
      { rule: 'unresolved-runtime-dependency', target: 'require' },
    ]);
  });

  it('applies different roles without encoding domain or feature names in the analyzer', () => {
    const root = project({
      'domain/decision-policy.ts': 'setTimeout(() => {}, 1);',
      'jobs/worker-attempts.ts':
        "import { counter } from 'instrumentation'; setTimeout(() => {}, 1);",
      'views/observation.ts': "import { counter } from 'instrumentation';",
    });
    const report = analyzeRuntimeBoundaries(root, {
      roles: [
        role,
        {
          name: 'scheduling',
          modules: ['**/*-attempts.ts'],
          forbiddenDependencies: ['instrumentation'],
          forbiddenCalls: [],
        },
        {
          name: 'observation',
          modules: ['**/observation.ts'],
          forbiddenDependencies: [],
          forbiddenCalls: [],
        },
      ],
      exclude: [],
    });
    expect(report.summary).toEqual({ discoveredModules: 3, classifiedModules: 3, findings: 2 });
    expect(report.findings.map((finding) => finding.role)).toEqual([
      'decision-policy',
      'scheduling',
    ]);
  });

  it('discovers newly matching modules and honors exclusions across directory depths', () => {
    const root = project({
      'a/one-policy.ts': 'setTimeout(() => {}, 1);',
      'b/nested/two-policy.ts': 'process.exit(1);',
      'b/__tests__/fixture-policy.ts': 'process.exit(1);',
      'generated/generated-policy.ts': 'process.exit(1);',
      'other.ts': 'process.exit(1);',
    });
    const report = analyzeRuntimeBoundaries(root, {
      roles: [role],
      exclude: ['**/__tests__/**', '**/generated/**'],
    });
    expect(report.summary).toEqual({ discoveredModules: 3, classifiedModules: 2, findings: 2 });
    expect(report.modules.map((module) => module.source)).toEqual([
      'a/one-policy.ts',
      'b/nested/two-policy.ts',
    ]);
  });

  it('fails visibly on invalid syntax or malformed role configuration', () => {
    expect(() => inspect('export function broken( {')).toThrow(/parse/i);
    expect(() =>
      analyzeRuntimeBoundaries(project({}), { roles: [{ name: 'invalid' }], exclude: [] }),
    ).toThrow(/modules/);
  });

  it('checks lifecycle framework dependencies and exit ownership through ordinary role configuration', () => {
    const lifecycle = {
      name: 'lifecycle-sequencer',
      modules: ['**/*-sequencer.ts'],
      forbiddenDependencies: ['server-framework', 'server-framework/**'],
      forbiddenCalls: ['process.exit'],
    };
    expect(
      inspect(
        `
      import type { Server } from 'server-framework';
      import { createServer } from 'server-framework/runtime';
      process['exit'](1);
      injectedExitStrategy(1);
    `,
        lifecycle,
      ).map((finding) => finding.rule),
    ).toEqual(['forbidden-runtime-dependency', 'forbidden-runtime-call']);
  });
});
