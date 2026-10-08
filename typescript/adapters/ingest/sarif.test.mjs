import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../core/diff/finding-schema.mjs';
import { ingestSarif, ingestSarifText, normalizeUri } from './sarif.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const options = { root: '/work/repo' };
const FINDING_KEYS = new Set([
  'tool',
  'rule',
  'path',
  'identity',
  'message',
  'classification',
  'symbol',
  'location',
]);

function singleResultLog(result) {
  return { runs: [{ tool: { driver: { name: 't' } }, results: [result] }] };
}

function at(uri, extra = {}) {
  return {
    ruleId: 'R',
    locations: [{ physicalLocation: { artifactLocation: { uri } } }],
    ...extra,
  };
}

describe('ingestSarif', () => {
  it('produces findings that satisfy the findings schema', () => {
    const { findings } = ingestSarifText(fixture('sarif-base.json'), options);
    expect(findings).toHaveLength(4);
    expect(parseAnalyzerReport({ findings }, 'sarif').findings).toEqual(findings);
    for (const finding of findings) {
      expect(Object.keys(finding).every((key) => FINDING_KEYS.has(key))).toBe(true);
    }
  });

  it('keeps identity stable when lines move', () => {
    const base = ingestSarifText(fixture('sarif-base.json'), options).findings;
    const head = ingestSarifText(fixture('sarif-head.json'), options).findings;
    expect(head.map((finding) => finding.identity)).toEqual(
      base.map((finding) => finding.identity),
    );
    expect(head[0].location.line).toBe(base[0].location.line + 7);
  });

  it('uses partialFingerprints when present and a rule/path/symbol hash otherwise', () => {
    const [fingerprinted, symbolic] = ingestSarifText(fixture('sarif-base.json'), options).findings;
    expect(fingerprinted.identity).toBe('fp:primaryLocationLineHash=abc123:1');
    expect(symbolic.identity).toMatch(/^sarif:[0-9a-f]{16}$/);
    expect(symbolic.symbol).toBe('B.run');
    expect(symbolic.path).toBe('src/b.js');
  });

  it('is independent of fingerprint key order', () => {
    const make = (partialFingerprints) =>
      ingestSarif(singleResultLog(at('a.js', { partialFingerprints }))).findings[0].identity;
    expect(make({ a: '1', b: '2' })).toBe(make({ b: '2', a: '1' }));
  });

  it('numbers results sharing an identity in report order, not by position', () => {
    const findings = ingestSarifText(fixture('sarif-base.json'), options).findings;
    expect(findings[1].identity).not.toBe(findings[2].identity);
    expect(findings[2].identity).toBe(`${findings[1].identity}#2`);
  });

  it('changes the hash identity when rule, path or symbol changes', () => {
    const identityOf = (rule, uri, symbol) =>
      ingestSarif(
        singleResultLog({
          ruleId: rule,
          locations: [
            {
              physicalLocation: { artifactLocation: { uri } },
              logicalLocations: [{ fullyQualifiedName: symbol }],
            },
          ],
        }),
      ).findings[0].identity;
    const base = identityOf('R', 'a.js', 'S');
    expect(identityOf('R2', 'a.js', 'S')).not.toBe(base);
    expect(identityOf('R', 'b.js', 'S')).not.toBe(base);
    expect(identityOf('R', 'a.js', 'T')).not.toBe(base);
    expect(identityOf('R', 'a.js', 'S')).toBe(base);
  });

  it('maps levels, rule defaults and kinds to classifications', () => {
    const findings = ingestSarifText(fixture('sarif-base.json'), options).findings;
    expect(findings.map((finding) => finding.classification)).toEqual([
      'enforceable',
      'enforceable',
      'enforceable',
      'descriptive',
    ]);
    const log = {
      runs: [
        {
          tool: { driver: { name: 't' } },
          results: [at('a.js', { kind: 'review' }), at('a.js', { kind: 'pass' })],
        },
      ],
    };
    expect(ingestSarif(log).findings.map((finding) => finding.classification)).toEqual([
      'descriptive',
    ]);
  });

  it('reports unusable results as skipped', () => {
    const { findings, skipped } = ingestSarif({
      runs: [
        {
          tool: { driver: { name: 't' } },
          results: [at('/etc/passwd'), { locations: at('a.js').locations }],
        },
      ],
    });
    expect(findings).toEqual([]);
    expect(skipped.map((entry) => entry.reason)).toEqual(['no usable path', 'no rule']);
  });

  it('rejects input that is not a SARIF log', () => {
    expect(() => ingestSarif({})).toThrow('runs array');
    expect(() => ingestSarif({ runs: [1] })).toThrow('must be an object');
  });
});

describe('normalizeUri', () => {
  it('relativizes file uris and rejects escaping paths', () => {
    expect(normalizeUri('file:///work/repo/src/a.js', '/work/repo')).toBe('src/a.js');
    expect(normalizeUri('./src\\a%20b.js')).toBe('src/a b.js');
    expect(normalizeUri('../x.js')).toBeUndefined();
    expect(normalizeUri('C:\\x.js')).toBeUndefined();
  });
});
