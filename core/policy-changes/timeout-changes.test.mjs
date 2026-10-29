import { describe, expect, it } from 'vitest';
import { hasSpecificGuidance } from '../diff/reporting/review/policy-guidance.mjs';
import { timeoutChanges } from './timeout-changes.mjs';
import { policyChangeFields } from './describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from './policy-scope.mjs';

const LANGUAGES = ['typescript', 'javascript', 'java', 'kotlin', 'python'];
const config = (timeouts) => ({ tools: { tests: { timeouts } } });
const project = (limits = {}, include = ['test/jvm/**']) => ({
  language: 'java',
  include,
  ...limits,
});
const ceilings = (value) => ({ testDeclarationCeilingMs: value, hookDeclarationCeilingMs: value });

function loosenedTexts(base, head) {
  const { loosened } = timeoutChanges(base, head);
  for (const { text, kind } of loosened) {
    expect(hasSpecificGuidance(kind), text).toBe(true);
  }
  return loosened.map(({ text }) => text);
}

function policyFields(base, head) {
  const scope = createPolicyScope({
    files: [],
    baseRoots: rootSets(base, '.'),
    headRoots: rootSets(head, '.'),
    headConfig: head,
  });
  return policyChangeFields(base, head, scope);
}

describe('timeout policy changes', () => {
  it('compares effective tiers and allows equivalent moves and lower ceilings', () => {
    const base = config({ defaults: ceilings(20_000) });
    const moved = config({
      languages: Object.fromEntries(
        ['typescript', 'javascript', 'java', 'kotlin', 'python'].map((language) => [
          language,
          ceilings(20_000),
        ]),
      ),
    });
    expect(timeoutChanges(base, moved)).toEqual({ loosened: [], changed: [] });
    expect(timeoutChanges(base, config({ defaults: ceilings(15_000) })).loosened).toEqual([]);
  });

  it('does not mistake a shadowed language scalar increase for an effective loosening', () => {
    const base = config({ languages: { java: ceilings(12_000) }, defaults: ceilings(20_000) });
    const head = config({ languages: { java: ceilings(18_000) }, defaults: ceilings(20_000) });
    expect(timeoutChanges(base, head)).toEqual({ loosened: [], changed: [] });
  });

  it('detects deleting a stricter repo or project override', () => {
    const base = config({ languages: { java: ceilings(20_000) }, defaults: ceilings(5_000) });
    const head = config({ languages: { java: ceilings(20_000) } });
    expect(loosenedTexts(base, head)).toEqual(
      LANGUAGES.flatMap((language) => [
        `test timeout ${language} testDeclarationCeilingMs raised from 5000 to ${language === 'java' ? 20000 : 10000}`,
        `test timeout ${language} hookDeclarationCeilingMs raised from 5000 to ${language === 'java' ? 20000 : 10000}`,
      ]),
    );
    const strictProject = config({ projects: { jvm: project(ceilings(5_000)) } });
    expect(loosenedTexts(strictProject, {})).toEqual([
      'test timeout project jvm testDeclarationCeilingMs raised from 5000 to 10000',
      'test timeout project jvm hookDeclarationCeilingMs raised from 5000 to 10000',
    ]);
  });

  it('allows equivalent project rename and detects expanded future membership', () => {
    const base = config({ projects: { jvm: project(ceilings(20_000)) } });
    expect(
      timeoutChanges(base, config({ projects: { renamed: project(ceilings(20_000)) } })),
    ).toEqual({ loosened: [], changed: [] });
    const widened = config({
      projects: { jvm: project(ceilings(20_000), ['test/jvm/**', 'test/new/**']) },
    });
    expect(loosenedTexts(base, widened)).toEqual([
      'test timeout project jvm membership added: ["test/new/**"] (java)',
      'test timeout project jvm testDeclarationCeilingMs raised from 10000 to 20000',
      'test timeout project jvm hookDeclarationCeilingMs raised from 10000 to 20000',
    ]);
  });

  it('allows shrinking a looser suite and detects shrinking a stricter suite', () => {
    const includes = ['test/jvm/**', 'test/new/**'];
    const loosened = [5_000, 20_000].map((value) => {
      const base = config({ projects: { jvm: project(ceilings(value), includes) } });
      const head = config({ projects: { jvm: project(ceilings(value)) } });
      return timeoutChanges(base, head).loosened.length > 0;
    });
    expect(loosened).toEqual([true, false]);
  });

  it('reviews real execution increases and transitions to native hook deadlines', () => {
    const base = config({ defaults: { testTimeoutMs: 30_000, hookTimeoutMs: 30_000 } });
    const head = config({ defaults: { testTimeoutMs: 40_000 } });
    const result = loosenedTexts(base, head);
    expect(result).toEqual(
      LANGUAGES.flatMap((language) => [
        `test timeout ${language} testTimeoutMs raised from 30000 to 40000`,
        `test timeout ${language} hookTimeoutMs changed from 30000 to native`,
      ]),
    );
  });

  it('fails closed on invalid policy without mutating the ordinary approval mechanism', () => {
    const head = config({ defaults: { testTimeoutMs: -1 } });
    const fields = policyFields({}, head);
    expect(fields.policyLoosenings).toEqual([
      'test timeout policy cannot be compared safely: nitpicker.config.json: "tools.tests.timeouts.defaults.testTimeoutMs" must be a positive integer in milliseconds',
    ]);
    expect(fields.policyDigest).toMatch(/^[a-f0-9]{12}$/u);
  });

  it('rejects an ambiguous duplicate project even when its effective tiers are equal', () => {
    const base = config({ projects: { jvm: project() } });
    const head = config({ projects: { jvm: project(), duplicate: project() } });
    expect(loosenedTexts(base, head)).toEqual([
      'test timeout policy cannot be compared safely: timeout project jvm shares a selector with another project',
    ]);
  });

  it('places effective timeout increases in the existing digest and skips scalar duplicates', () => {
    const head = config({ languages: { java: { testDeclarationCeilingMs: 20_000 } } });
    const first = policyFields({}, head);
    expect(first.policyChanges).toEqual([
      'test timeout java testDeclarationCeilingMs raised from 10000 to 20000',
    ]);
    expect(first.policyDigest).toMatch(/^[a-f0-9]{12}$/u);
    expect(
      policyFields({}, config({ languages: { java: { testDeclarationCeilingMs: 25_000 } } }))
        .policyDigest,
    ).not.toBe(first.policyDigest);
  });
});
