import { beforeAll, describe, expect, it } from 'vitest';
import { traceOf } from '../analyze.mjs';
import { evaluateLookup } from '../evaluate.mjs';
import { LOOKUP_ENTRY, LOOKUP_FILE, lookupVariants } from './lookup.mjs';

const RESOLVER = '../execution/run-analyzers.mjs#resolveAnalyzerMetadata';
const SEEDED = [
  'seed-omit-resolution',
  'seed-read-before-resolution',
  'seed-wrong-object',
  'seed-continue-after-failure',
  'seed-conditional-resolution',
];
const UNSUPPORTED = [
  ['unsupported-unknown-recovery', ['unknown-call']],
  ['unsupported-alias-dispatch', ['unknown-dispatch', 'unknown-guard']],
  ['unsupported-repeated-read', ['loop', 'unknown-guard']],
];

function reasonsOf(result) {
  return [...new Set(result.reasons.map((item) => item.reason))].sort();
}

describe(`coupling to ${LOOKUP_ENTRY} in ${LOOKUP_FILE}`, () => {
  let lookup;

  beforeAll(() => {
    lookup = evaluateLookup();
  });

  function variantNamed(name) {
    return lookup.variants.find((variant) => variant.name === name);
  }

  it('is complete with zero violations and three paths within the reviewed contract', () => {
    const { result } = variantNamed('unchanged');

    expect([
      result.status,
      result.violations,
      result.paths.map((path) => `${traceOf(path)} ${path.value}`),
    ]).toEqual([
      'complete',
      [],
      [
        `${RESOLVER}:throws => return { kind: unresolved, error: error:${RESOLVER}#1 }`,
        `${RESOLVER}:resolved > cache.read:miss => return { kind: miss }`,
        `${RESOLVER}:resolved > cache.read:hit => return { kind: hit, report: cache.read#2 }`,
      ],
    ]);
  });

  it('applies the seeded edits to CRLF sources as to LF sources', () => {
    const { text } = variantNamed('unchanged');
    function texts(source) {
      return lookupVariants(source).map((variant) => variant.text);
    }

    expect(texts(text.replaceAll('\n', '\r\n'))).toEqual(texts(text));
  });

  it('names the source file and this module when a seeded edit no longer matches', () => {
    function stale() {
      lookupVariants('export function lookUpCachedReport() {}\n');
    }

    const edit = [
      '  try {',
      '    resolveAnalyzerMetadata(analyzer, resolveContext);',
      '  } catch (error) {',
      "    return { kind: 'unresolved', error };",
      '  }',
      '',
    ].join('\n');
    const hint = `${LOOKUP_FILE} changed, so update the seeded edits in evals/flow-model/real/lookup.mjs`;
    const message = `flow-model: seeded edit ${JSON.stringify(edit)} does not match exactly once; ${hint}`;

    expect(stale).toThrowError(new Error(message));
  });

  it.each(SEEDED)('%s is detected with a witness at the cache read', (name) => {
    const variant = variantNamed(name);
    const [found] = variant.result.violations;

    expect([
      variant.result.status,
      variant.result.violations.length,
      found.observation,
      found.certainty,
      variant.text.split('\n')[found.line - 1].trim(),
    ]).toEqual([
      'complete',
      1,
      'resolve-before-read|cache.read|analyzer',
      'definite',
      'const report = cache.read(analyzer);',
    ]);
  });

  it.each(UNSUPPORTED)('%s stays partial with its reasons', (name, reasons) => {
    const { result, labelMatch } = variantNamed(name);

    expect([result.status, reasonsOf(result), labelMatch]).toEqual(['partial', reasons, true]);
  });

  it('agrees with the concrete oracle on every variant, exactly where complete', () => {
    const modes = lookup.variants.map((variant) => [
      variant.name,
      variant.comparison.mode,
      variant.comparison.agree,
    ]);

    expect(modes).toEqual([
      ['unchanged', 'exact', true],
      ...SEEDED.map((name) => [name, 'exact', true]),
      ['head-inverted-guard', 'exact', true],
      ...UNSUPPORTED.map(([name]) => [name, 'subset', true]),
    ]);
  });
});
