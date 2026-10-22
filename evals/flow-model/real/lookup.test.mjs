import { describe, expect, it } from 'vitest';
import { evaluateLookup } from '../evaluate.mjs';
import { traceOf } from '../check/analyze.mjs';
import { LOOKUP_ENTRY, LOOKUP_FILE } from './lookup.mjs';

const lookup = evaluateLookup();
const byKind = (kind) => lookup.variants.filter((variant) => variant.kind === kind);

describe(`${LOOKUP_ENTRY} in ${LOOKUP_FILE}`, () => {
  it('is complete with zero violations and three paths within the reviewed contract', () => {
    const [unchanged] = byKind('unchanged');

    expect(unchanged.result.status).toBe('complete');
    expect(unchanged.result.violations).toEqual([]);
    expect(unchanged.result.paths.map((path) => `${traceOf(path)} ${path.value}`)).toEqual([
      'resolveAnalyzerMetadata:throws => return { kind: unresolved, error: error:resolveAnalyzerMetadata#1 }',
      'resolveAnalyzerMetadata:resolved > cache.read:miss => return { kind: miss }',
      'resolveAnalyzerMetadata:resolved > cache.read:hit => return { kind: hit, report: cache.read#2 }',
    ]);
  });

  it('records the hashes of the verified source', () => {
    expect(lookup.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lookup.entrySha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(byKind('seeded').map((variant) => [variant.name, variant]))(
    '%s is detected with a witness at the cache read',
    (_name, variant) => {
      const [found] = variant.result.violations;

      expect(variant.result.status).toBe('complete');
      expect(found).toMatchObject({
        contract: 'resolve-before-read',
        callee: 'cache.read',
        entity: 'analyzer',
      });
      expect(variant.text.split('\n')[found.line - 1]).toContain('cache.read(analyzer)');
    },
  );

  it.each(byKind('unsupported').map((variant) => [variant.name, variant]))(
    '%s stays partial with its reason',
    (_name, variant) => {
      expect(variant.result.status).toBe('partial');
      expect(variant.labelMatch).toBe(true);
    },
  );

  it('agrees with the concrete oracle on every supported variant', () => {
    const compared = lookup.variants.filter((variant) => variant.comparison !== undefined);

    expect(compared.map((variant) => variant.name)).toEqual(
      lookup.variants
        .filter((variant) => variant.kind !== 'unsupported')
        .map((variant) => variant.name),
    );
    expect(compared.filter((variant) => !variant.comparison.agree)).toEqual([]);
    expect(compared.every((variant) => variant.comparison.executions > 0)).toBe(true);
  });
});
