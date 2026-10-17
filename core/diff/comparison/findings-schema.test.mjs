import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeArchitectureViolations } from '../../../languages/typescript/adapters/static-checks-runner.mjs';
import {
  normalizeCoupling,
  normalizeStructure,
  normalizeTestRuntime,
} from '../../../languages/typescript/adapters/quality-areas/reporting/repository.mjs';
import { normalizeDeadCode } from '../../../languages/typescript/adapters/quality-areas/reporting/dead-code.mjs';
import {
  normalizeCrap,
  normalizeMutation,
} from '../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';
import { normalizeDuplicates } from '../../../languages/typescript/preset/duplicates/normalize.mjs';
import { toEntryPointDiffFindings } from '../../../languages/typescript/adapters/entry-points.mjs';
import { parseAnalyzerReport, parseFinding } from './finding-schema.mjs';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(
  readFileSync(
    path.resolve(fileURLToPath(new URL('../', import.meta.url)), '../../spec/findings.schema.json'),
    'utf8',
  ),
);

const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minLength',
  'minimum',
  'pattern',
  'allOf',
  'not',
  'if',
  'then',
]);

function assertSupportedKeywords(node) {
  for (const keyword of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`Validator does not support schema keyword: ${keyword}`);
    }
  }
}

function validateReference(value, node, errors, at) {
  if (node.$ref === undefined) {
    return;
  }
  const target = node.$ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((current, key) => current[key], schema);
  validate(value, target, errors, at);
}

function checkNumber(value, node, errors, at) {
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) {
    errors.push(`${at} must be >= ${String(node.minimum)}`);
  }
}

function checkAllowedValues(value, node, errors, at) {
  if (node.enum !== undefined && !node.enum.includes(value)) {
    errors.push(`${at} must be one of ${node.enum.join(', ')}`);
  }
  if (node.const !== undefined && value !== node.const) {
    errors.push(`${at} must equal ${String(node.const)}`);
  }
}

function checkCombinators(value, node, errors, at) {
  for (const part of node.allOf ?? []) {
    validate(value, part, errors, at);
  }
  if (node.not !== undefined && validate(value, node.not, [], at).length === 0) {
    errors.push(`${at} matches a forbidden schema`);
  }
  if (node.if !== undefined && validate(value, node.if, [], at).length === 0 && node.then) {
    validate(value, node.then, errors, at);
  }
}

function validate(value, node = schema, errors = [], at = '$') {
  assertSupportedKeywords(node);
  validateReference(value, node, errors, at);
  checkType(value, node, errors, at);
  if (typeof value === 'string') {
    checkString(value, node, errors, at);
  }
  checkNumber(value, node, errors, at);
  checkAllowedValues(value, node, errors, at);
  checkCombinators(value, node, errors, at);
  if (isRecord(value)) {
    checkObject(value, node, errors, at);
  }
  if (Array.isArray(value) && node.items !== undefined) {
    validateItems(value, node.items, errors, at);
  }
  return errors;
}

function validateItems(items, node, errors, at) {
  for (const [index, item] of items.entries()) {
    validate(item, node, errors, `${at}[${String(index)}]`);
  }
}

function checkType(value, node, errors, at) {
  const checks = {
    object: isRecord(value),
    array: Array.isArray(value),
    string: typeof value === 'string',
    number: typeof value === 'number' && Number.isFinite(value),
    integer: Number.isInteger(value),
    boolean: typeof value === 'boolean',
  };
  if (node.type !== undefined && !checks[node.type]) {
    errors.push(`${at} must be ${node.type}`);
  }
}

function checkString(value, node, errors, at) {
  if (node.minLength !== undefined && value.length < node.minLength) {
    errors.push(`${at} is shorter than ${String(node.minLength)}`);
  }
  if (node.pattern !== undefined && !new RegExp(node.pattern, 'u').test(value)) {
    errors.push(`${at} does not match ${node.pattern}`);
  }
}

function checkObject(value, node, errors, at) {
  for (const key of node.required ?? []) {
    if (!(key in value)) {
      errors.push(`${at}.${key} is required`);
    }
  }
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (key in value) {
      validate(value[key], child, errors, `${at}.${key}`);
    }
  }
  if (node.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in (node.properties ?? {}))) {
        errors.push(`${at}.${key} is not allowed`);
      }
    }
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sampleFindings() {
  const crapEntry = (crap) => ({
    source: 'src/main/value.ts',
    function: 'value',
    sourceHash: 'h',
    lines: { start: 1, end: 3 },
    complexity: 1,
    statementCoverage: { percent: 100 },
    branchCoverage: { percent: 100 },
    effectiveCoverage: { percent: 100 },
    crap,
  });
  return [
    ...normalizeCoupling(
      {
        summary: { modules: 2 },
        modules: [{ source: 'src/main/a.ts', fanIn: 1, fanOut: 2 }],
        stabilityDirection: [{ source: 'stable', target: 'volatile', delta: 0.5 }],
      },
      'coupling',
    ),
    ...normalizeTestRuntime(
      {
        summary: { discoveredTests: 1, categories: { 'no-production-runtime': 1 } },
        findings: [{ category: 'no-production-runtime', test: 'tests/orphan.test.ts' }],
      },
      'test-runtime',
    ),
    ...normalizeStructure(
      {
        functions: [
          {
            source: 'src/main/value.ts',
            function: 'value',
            sourceHash: 'f',
            start: 1,
            end: 51,
            lines: 51,
            statements: 16,
            maxControlNesting: 3,
            parameters: 4,
          },
        ],
      },
      'structure',
    ),
    ...normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'a.ts', start: 2 },
            secondFile: { name: 'b.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      { configuredPaths: ['src/main'] },
    ),
    ...normalizeDeadCode(
      {
        files: ['src/main/unused.ts'],
        issues: [{ file: 'src/main/unused.ts', exports: [{ name: 'x', line: 4, col: 14 }] }],
      },
      'dead-code',
    ),
    ...normalizeCrap({ functions: [crapEntry(10), crapEntry(null)] }, 'crap'),
    ...normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
            ],
          },
        },
      },
      'mutation',
    ),
    ...normalizeArchitectureViolations(
      {
        summary: {
          violations: [
            {
              type: 'cycle',
              from: 'src/main/a.ts',
              to: 'src/main/b.ts',
              rule: { name: 'no-production-cycles', severity: 'error' },
              cycle: [{ name: 'src/main/a.ts' }, { name: 'src/main/b.ts' }],
            },
            {
              from: 'src/main/a.ts',
              to: 'src/main/c.ts',
              rule: { name: 'no-orphans', severity: 'warn' },
            },
          ],
        },
      },
      'dependency-architecture',
    ),
    ...toEntryPointDiffFindings({
      publicAlternativeBypasses: [
        {
          source: 'src/main/alpha/consumer.ts',
          target: 'src/main/beta/internal.ts',
          publicEntryPoint: 'src/main/beta/index.ts',
          dependencyKind: 'runtime',
        },
      ],
    }),
  ];
}

describe('spec/findings.schema.json', () => {
  it('accepts every finding produced by the existing analyzer normalizers', () => {
    const findings = sampleFindings();

    expect(findings.length).toBeGreaterThan(20);
    expect(new Set(findings.map(({ classification }) => classification))).toEqual(
      new Set(['enforceable', 'descriptive']),
    );
    expect(validate({ findings })).toEqual([]);
  });

  it('accepts what the reference parser accepts, including tool-error findings', () => {
    const report = {
      findings: [
        ...sampleFindings(),
        {
          tool: 'eslint-lint',
          rule: 'crash',
          path: '.',
          identity: 'crash',
          message: 'analyzer crashed',
          classification: 'tool-error',
        },
      ],
    };

    expect(parseAnalyzerReport(report, 'fixture').findings).toHaveLength(report.findings.length);
    expect(validate(report)).toEqual([]);
  });

  it('rejects the same malformed findings as the reference parser', () => {
    const valid = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
    };
    const malformed = [
      { ...valid, tool: '' },
      { ...valid, rule: undefined },
      { ...valid, path: '../outside.ts' },
      { ...valid, path: '/abs/file.ts' },
      { ...valid, path: 'C:/windows/file.ts' },
      { ...valid, identity: 'bad\0id' },
      { ...valid, classification: 'blocking' },
      { ...valid, symbol: '' },
      { ...valid, location: { line: 0 } },
      { ...valid, location: { line: 1, column: 1.5 } },
      { ...valid, classification: 'descriptive', metric: { name: 'm', value: Infinity } },
      { ...valid, metric: { name: 'm', value: 1 } },
    ];

    for (const finding of malformed) {
      expect(() => parseFinding(finding)).toThrow(TypeError);
      expect(validate({ findings: [finding] }), JSON.stringify(finding)).not.toEqual([]);
    }
    expect(validate({})).not.toEqual([]);
    expect(validate({ findings: [{ ...valid, extra: true }] })).not.toEqual([]);
  });

  it('accepts optional symbol, location and metric fields', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'descriptive',
      symbol: 'fn',
      location: { line: 3, column: 2 },
      metric: { name: 'm', value: 0.5 },
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
  });

  it('accepts a ratchet with growth advice and rejects an empty one', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      ratchet: { key: 'count:k', value: 2, growthAdvice: 'Had {base}.' },
    };
    const empty = { ...finding, ratchet: { ...finding.ratchet, growthAdvice: '' } };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(empty)).toThrow(TypeError);
    expect(validate({ findings: [empty] })).not.toEqual([]);
  });

  it('accepts the number of files of a folder finding and rejects zero', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      ratchet: { key: 'depth', value: 5, pathIsFolder: true, folderFiles: 3 },
    };
    const none = { ...finding, ratchet: { ...finding.ratchet, folderFiles: 0 } };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(none)).toThrow(TypeError);
    expect(validate({ findings: [none] })).not.toEqual([]);
  });

  it('is exercised by a validator that covers every keyword the schema uses', () => {
    expect(() => validate({ findings: [] })).not.toThrow();
    expect(() => validate({ findings: [] }, { oneOf: [] })).toThrow(/does not support/);
  });
});
