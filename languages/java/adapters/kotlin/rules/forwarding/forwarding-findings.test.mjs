import { describe, expect, it } from 'vitest';
import { forwardingFindings, FORWARDING_RULE } from './forwarding-findings.mjs';
import { applyFindingPolicy } from '../../../../../../shared/findings/finding-policy.mjs';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../../../../core/diff/comparison/finding-schema.mjs';
import { validateKotlinOptions } from '../../kotlin-options.mjs';

const manifest = {
  kotlinSourceRoots: ['custom/production/', 'build/generated'],
  kotlinTestSourceRoots: ['custom/production/tests'],
};
const entry = { file: 'custom/production/Forward.kt', name: 'wrapped', target: 'target', line: 4 };

function reported(forwarders) {
  return forwardingFindings({ forwarders }, manifest);
}

describe('Kotlin forwarding findings', () => {
  it('reports schema-valid findings with ownership and remediation', () => {
    const findings = reported([entry]);

    expect(parseAnalyzerReport({ findings }, 'kotlin').findings).toEqual(findings);
    expect(findings).toEqual([
      {
        tool: 'detekt',
        rule: FORWARDING_RULE,
        path: entry.file,
        identity: 'forward:wrapped:target',
        symbol: 'wrapped',
        location: { line: 4 },
        classification: 'enforceable',
        message:
          'wrapped only forwards unchanged arguments to the directly accessible top-level function target in custom/production/Forward.kt, with the same parameter names, types and return type. Call target directly and remove wrapped; keep a wrapper when it adds policy or adapts the contract. For a required compatibility boundary, add an "exceptions" entry for rule no-forwarding-wrapper with reviewed paths and a reason in nitpicker.config.json.',
      },
    ]);
  });

  it('uses declared production roots and excludes nested test roots and sibling prefixes', () => {
    expect(
      reported([
        entry,
        { ...entry, file: 'custom/production/tests/ForwardTest.kt' },
        { ...entry, file: 'custom/production-extra/Other.kt' },
        { ...entry, file: 'unconfigured/Other.kt' },
      ]),
    ).toEqual(reported([entry]));
    expect(forwardingFindings({}, manifest)).toEqual([]);
    expect(forwardingFindings({ forwarders: [entry] }, {})).toEqual([]);
  });

  it('keeps shifted findings baselined while a new wrapper reports', () => {
    const baseFindings = reported([entry]);
    const headFindings = reported([
      { ...entry, line: 20 },
      { ...entry, name: 'second', line: 24 },
    ]);
    const result = compareFindings({ baseFindings, headFindings });

    expect(result.newFindings.map(({ symbol }) => symbol)).toEqual(['second']);
    expect(result.unchangedFindings.map(({ symbol }) => symbol)).toEqual(['wrapped']);
    expect(result.resolvedFindings).toEqual([]);
  });

  it('registers reviewed path exceptions and preserves findings on other paths', () => {
    const exception = {
      rule: FORWARDING_RULE,
      paths: [entry.file],
      reason: 'Compatibility boundary',
    };
    expect(() =>
      validateKotlinOptions({ preset: 'kotlin', exceptions: [exception] }),
    ).not.toThrow();
    const other = { ...entry, file: 'custom/production/Other.kt' };

    expect(
      applyFindingPolicy(reported([entry, other]), {
        exceptions: [{ rule: FORWARDING_RULE, glob: entry.file }],
      }),
    ).toEqual(reported([other]));
    expect(
      applyFindingPolicy(reported([{ ...entry, file: 'build/generated/Generated.kt' }]), {
        exclude: ['build/generated/**'],
      }),
    ).toEqual([]);
  });
});
