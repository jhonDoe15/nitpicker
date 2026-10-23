import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HEAD_POLICY_ENV } from '../../../../shared/head-policy.mjs';
import { normalizeArchitectureViolations } from '../static-checks-runner.mjs';
import { applyAreaExceptions } from './area-exceptions.mjs';

const architectureFindings = (report, analyzerName) =>
  applyAreaExceptions(normalizeArchitectureViolations(report, analyzerName));
const roots = [];
const originalPolicy = process.env[HEAD_POLICY_ENV];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  if (originalPolicy === undefined) {
    Reflect.deleteProperty(process.env, HEAD_POLICY_ENV);
  } else {
    process.env[HEAD_POLICY_ENV] = originalPolicy;
  }
});

function withExceptions(exceptions) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-area-exceptions-'));
  roots.push(root);
  const policyFile = path.join(root, 'policy.json');
  writeFileSync(policyFile, JSON.stringify({ exceptions }));
  process.env[HEAD_POLICY_ENV] = policyFile;
}

const finding = (tool, rule, overrides = {}) => ({
  tool,
  rule,
  path: 'src/main/a.ts',
  identity: `${rule}:1`,
  message: 'The base message.',
  classification: 'enforceable',
  ...overrides,
});

const route = (entry) =>
  `If this is intended, add ${entry} to "exceptions" in nitpicker.config.json.`;

const ROUTED = [
  ['test-runtime', 'no-production-runtime'],
  ['test-runtime', 'type-only-production-dependency'],
  ['entry-points', 'public-alternative-bypass'],
  ['coding-standards', 'public-contract-production-use'],
  ['coding-standards', 'runtime-boundary/no-fetch'],
  ['coding-standards', 'callback-protocol/no-promise-callback'],
  ['dependency-architecture', 'no-production-cycles'],
  ['dependency-architecture', 'domain-does-not-import-adapters'],
  ['mutation', 'mutant-survived'],
  ['coupling', 'stability-direction'],
  ['dead-code', 'files'],
];

describe('applyAreaExceptions', () => {
  it.each(ROUTED)(
    'names the entry that lifts a %s %s finding, and the entry lifts it',
    (tool, rule) => {
      withExceptions([{ rule, paths: ['src/main/**'], reason: 'A reviewed reason.' }]);
      const found = finding(tool, rule);

      expect(applyAreaExceptions([found])).toEqual([]);

      withExceptions([]);
      expect(applyAreaExceptions([found])).toEqual([
        {
          ...found,
          message: `The base message. ${route(`{"rule":"${rule}","paths":["src/main/a.ts"],"reason":"..."}`)}`,
        },
      ]);
    },
  );

  it('lifts a duplicate-clone finding and leaves its message to the exclude route', () => {
    const found = finding('duplicates', 'duplicate-clone');
    withExceptions([
      { rule: 'duplicate-clone', paths: ['src/main/**'], reason: 'A reviewed reason.' },
    ]);

    expect(applyAreaExceptions([found])).toEqual([]);

    withExceptions([]);
    expect(applyAreaExceptions([found])).toEqual([found]);
  });

  it('accepts the rule as the finding prints it, tool first', () => {
    withExceptions([
      {
        rule: 'test-runtime/no-production-runtime',
        paths: ['src/**'],
        reason: 'A reviewed reason.',
      },
    ]);

    expect(applyAreaExceptions([finding('test-runtime', 'no-production-runtime')])).toEqual([]);
  });

  it('gives a compiler diagnostic no entry', () => {
    withExceptions([]);
    const diagnostic = finding('typescript-typecheck', 'TS2322');

    expect(applyAreaExceptions([diagnostic])).toEqual([diagnostic]);
  });
});

describe('architectureFindings', () => {
  const report = {
    summary: {
      violations: [
        {
          rule: { name: 'domain-does-not-import-adapters', severity: 'error' },
          from: 'src/main/a.ts',
          to: 'src/main/adapters/b.ts',
          type: 'dependency',
        },
      ],
    },
  };

  it('names the entry of a violated dependency rule and drops the violation once it is configured', () => {
    withExceptions([]);
    const [violation] = architectureFindings(report, 'dependency-architecture');

    expect(violation.message).toBe(
      `src/main/a.ts must not depend on src/main/adapters/b.ts. ${route('{"rule":"domain-does-not-import-adapters","paths":["src/main/a.ts"],"reason":"..."}')}`,
    );

    withExceptions([
      {
        rule: 'domain-does-not-import-adapters',
        paths: ['src/main/a.ts'],
        reason: 'A reviewed reason.',
      },
    ]);
    expect(architectureFindings(report, 'dependency-architecture')).toEqual([]);
  });
});
