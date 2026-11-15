import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf, listOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { parseAnalyzerReport, parseFinding } from './test-support/parsed-findings.mts';
import { sampleFindings } from './test-support/sample-findings.mts';
import { compactMetricFindings as untypedCompactMetricFindings } from '../../../shared/report-output/metric-groups.mjs';

const compactMetricFindings: (findings: readonly unknown[]) => readonly unknown[] =
  untypedCompactMetricFindings;

const schema: unknown = parseJson(
  readFileSync(new URL('../../../spec/findings.schema.json', import.meta.url), 'utf8'),
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
  'minItems',
  'minimum',
  'pattern',
  'allOf',
  'not',
  'if',
  'then',
  'else',
]);

const VALID_FINDING = {
  tool: 'tool',
  rule: 'rule',
  path: 'src/a.ts',
  identity: 'id',
  message: 'message',
  classification: 'enforceable',
};
const MALFORMED_FINDINGS = [
  { ...VALID_FINDING, tool: '' },
  { ...VALID_FINDING, rule: undefined },
  { ...VALID_FINDING, path: '../outside.ts' },
  { ...VALID_FINDING, path: '/abs/file.ts' },
  { ...VALID_FINDING, path: 'C:/windows/file.ts' },
  { ...VALID_FINDING, identity: 'bad\0id' },
  { ...VALID_FINDING, classification: 'blocking' },
  { ...VALID_FINDING, symbol: '' },
  { ...VALID_FINDING, location: { line: 0 } },
  { ...VALID_FINDING, location: { line: 1, column: 1.5 } },
  { ...VALID_FINDING, classification: 'descriptive', metric: { name: 'm', value: Infinity } },
  { ...VALID_FINDING, metric: { name: 'm', value: 1 } },
];

function assertSupportedKeywords(node: unknown): void {
  for (const keyword of Object.keys(fieldsOf(node))) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`Validator does not support schema keyword: ${keyword}`);
    }
  }
}

function validateReference(value: unknown, node: unknown, errors: string[], at: string): void {
  const reference = fieldOf(node, '$ref');
  if (reference === undefined) {
    return;
  }
  const target = textOf(reference)
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>((current, key) => fieldOf(current, key), schema);
  validate(value, target, errors, at);
}

function checkNumber(value: unknown, node: unknown, errors: string[], at: string): void {
  const minimum = fieldOf(node, 'minimum');
  if (typeof value === 'number' && typeof minimum === 'number' && value < minimum) {
    errors.push(`${at} must be >= ${String(minimum)}`);
  }
}

function checkAllowedValues(value: unknown, node: unknown, errors: string[], at: string): void {
  const allowed = fieldOf(node, 'enum');
  if (allowed !== undefined && !listOf(allowed).includes(value)) {
    errors.push(`${at} must be one of ${listOf(allowed).join(', ')}`);
  }
  const constant = fieldOf(node, 'const');
  if (constant !== undefined && value !== constant) {
    errors.push(`${at} must equal ${textOf(constant)}`);
  }
}

function checkCombinators(value: unknown, node: unknown, errors: string[], at: string): void {
  for (const part of listOf(fieldOf(node, 'allOf'))) {
    validate(value, part, errors, at);
  }
  const forbidden = fieldOf(node, 'not');
  if (forbidden !== undefined && validate(value, forbidden, [], at).length === 0) {
    errors.push(`${at} matches a forbidden schema`);
  }
  const condition = fieldOf(node, 'if');
  if (condition === undefined) {
    return;
  }
  const branch = validate(value, condition, [], at).length === 0 ? 'then' : 'else';
  const consequence = fieldOf(node, branch);
  if (consequence !== undefined) {
    validate(value, consequence, errors, at);
  }
}

function validate(
  value: unknown,
  node: unknown = schema,
  errors: string[] = [],
  at = '$',
): string[] {
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
  const minItems = fieldOf(node, 'minItems');
  if (Array.isArray(value) && typeof minItems === 'number' && value.length < minItems) {
    errors.push(`${at} has fewer than ${String(minItems)} items`);
  }
  const itemNode = fieldOf(node, 'items');
  if (Array.isArray(value) && itemNode !== undefined) {
    validateItems(value, itemNode, errors, at);
  }
  return errors;
}

function validateItems(
  items: readonly unknown[],
  node: unknown,
  errors: string[],
  at: string,
): void {
  for (const [index, item] of items.entries()) {
    validate(item, node, errors, `${at}[${String(index)}]`);
  }
}

function checkType(value: unknown, node: unknown, errors: string[], at: string): void {
  const checks: Readonly<Record<string, boolean>> = {
    object: isRecord(value),
    array: Array.isArray(value),
    string: typeof value === 'string',
    number: typeof value === 'number' && Number.isFinite(value),
    integer: Number.isInteger(value),
    boolean: typeof value === 'boolean',
  };
  const type = fieldOf(node, 'type');
  if (type !== undefined && checks[textOf(type)] !== true) {
    errors.push(`${at} must be ${textOf(type)}`);
  }
}

function checkString(value: string, node: unknown, errors: string[], at: string): void {
  const minLength = fieldOf(node, 'minLength');
  if (typeof minLength === 'number' && value.length < minLength) {
    errors.push(`${at} is shorter than ${String(minLength)}`);
  }
  const pattern = fieldOf(node, 'pattern');
  if (pattern !== undefined && !new RegExp(textOf(pattern), 'u').test(value)) {
    errors.push(`${at} does not match ${textOf(pattern)}`);
  }
}

function checkObject(
  value: Readonly<Record<string, unknown>>,
  node: unknown,
  errors: string[],
  at: string,
): void {
  for (const key of listOf(fieldOf(node, 'required')).map(textOf)) {
    if (!(key in value)) {
      errors.push(`${at}.${key} is required`);
    }
  }
  const properties = fieldsOf(fieldOf(node, 'properties'));
  for (const [key, child] of Object.entries(properties)) {
    if (key in value) {
      validate(value[key], child, errors, `${at}.${key}`);
    }
  }
  const additional = fieldOf(node, 'additionalProperties');
  for (const key of Object.keys(value).filter((name) => !(name in properties))) {
    if (additional === false) {
      errors.push(`${at}.${key} is not allowed`);
    } else if (additional !== undefined) {
      validate(value[key], additional, errors, `${at}.${key}`);
    }
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  it('accepts the normalizer findings with their metrics grouped, which read back unchanged', () => {
    const findings = sampleFindings();
    const groups = compactMetricFindings(findings);

    expect(groups.length).toBeLessThan(findings.length);
    expect(validate({ findings: groups })).toEqual([]);
    expect(parseAnalyzerReport({ findings: groups }, 'fixture')).toEqual(
      parseAnalyzerReport({ findings }, 'fixture'),
    );
  });

  it('rejects a metric group with a message or a metric that is not a number', () => {
    const [group] = compactMetricFindings(sampleFindings()).filter((entry) =>
      isRecord(fieldOf(entry, 'metrics')),
    );

    expect(validate({ findings: [{ ...fieldsOf(group), message: 'm' }] })).toEqual([
      '$.findings[0].message is not allowed',
    ]);
    expect(validate({ findings: [{ ...fieldsOf(group), metrics: { lines: '1' } }] })).toEqual([
      '$.findings[0].metrics.lines must be number',
    ]);
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
      moduleImports: [{ from: 'src/billing/invoice.ts', to: 'src/invoicing' }],
    };

    expect(parseAnalyzerReport(report, 'fixture').findings).toHaveLength(report.findings.length);
    expect(parseAnalyzerReport(report, 'fixture').moduleImports).toEqual(report.moduleImports);
    expect(validate(report)).toEqual([]);
  });

  it.each(MALFORMED_FINDINGS)(
    'rejects the malformed finding %j like the reference parser',
    (finding) => {
      expect(() => parseFinding(finding)).toThrow(TypeError);
      expect(validate({ findings: [finding] })).not.toEqual([]);
    },
  );

  it('rejects a report without findings and a finding with an extra field', () => {
    expect(validate({})).not.toEqual([]);
    expect(validate({ findings: [{ ...VALID_FINDING, extra: true }] })).not.toEqual([]);
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

  it('accepts tokens and rejects an empty one', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      tokens: ['a', 'b', 'c'],
    };
    const empty = { ...finding, tokens: ['a', ''] };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(empty)).toThrow(TypeError);
    expect(validate({ findings: [empty] })).not.toEqual([]);
  });

  it('accepts the units around a finding, also outside the project, and rejects a unit without a count', () => {
    const finding = {
      tool: 'coupling',
      rule: 'stability-direction',
      path: 'src/features/loans',
      identity: 'package-edge:src/features/loans->src/features/fines',
      message: 'message',
      classification: 'enforceable',
      cause: {
        folders: ['src/features/loans'],
        units: [
          {
            unit: 'feature src/features/fines',
            folders: ['src/features/fines', '../generated/fines'],
            files: ['src/features/fines/index.ts'],
            count: 4,
          },
        ],
      },
    };
    const [unit] = finding.cause.units;
    const countless = { ...finding, cause: { ...finding.cause, units: [{ ...unit, count: 0 }] } };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(countless)).toThrow(TypeError);
    expect(validate({ findings: [countless] })).toHaveLength(1);
  });

  const linkedFinding = {
    tool: 'tool',
    rule: 'rule',
    path: 'src/a.ts',
    identity: 'id',
    message: 'message',
    classification: 'enforceable',
    helpUri: 'https://example.com/rules#rule',
  };

  it('accepts a helpUri that is an http or https URL', () => {
    const finding = linkedFinding;

    expect(parseFinding(finding)).toEqual(finding);
    expect(
      fieldOf(parseFinding({ ...finding, helpUri: 'http://example.com/rule' }), 'helpUri'),
    ).toBe('http://example.com/rule');
    expect(validate({ findings: [finding] })).toEqual([]);
  });

  it.each(['', 'rules/rule.md', 'javascript:alert(1)', 'https://a b', 7])(
    'rejects the helpUri %j',
    (helpUri) => {
      expect(() => parseFinding({ ...linkedFinding, helpUri })).toThrow(TypeError);
      expect(validate({ findings: [{ ...linkedFinding, helpUri }] })).not.toEqual([]);
    },
  );

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

  it.each([
    [{ from: 'src/billing/invoice.ts' }, ['$.moduleImports[0].to is required']],
    [{ from: 'src/billing.ts', to: 'src', files: 1 }, ['$.moduleImports[0].files is not allowed']],
  ])('rejects the module import %j like the reference parser', (entry, errors) => {
    const report = { findings: [], moduleImports: [entry] };
    expect(() => parseAnalyzerReport(report, 'fixture')).toThrow(TypeError);
    expect(validate(report)).toEqual(errors);
  });
});
