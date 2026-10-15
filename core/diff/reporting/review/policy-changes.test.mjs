import { describe, expect, it } from 'vitest';
import { appendPolicyChangeSummary, policyChangeSection } from './policy-changes.mjs';

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';

describe('policy change rendering', () => {
  it('renders nothing without changes', () => {
    const lines = ['kept'];
    appendPolicyChangeSummary(lines, { policyChanges: [] }, (text) => `<${text}>`);
    appendPolicyChangeSummary(lines, undefined, (text) => `<${text}>`);

    expect(policyChangeSection()).toEqual([]);
    expect(policyChangeSection({ policyChanges: [] })).toEqual([]);
    expect(lines).toEqual(['kept']);
  });

  it('renders a heading and one indented line per change', () => {
    const summary = { policyChanges: ['exclude added: a/**', 'analyzer disabled: mutation'] };
    const lines = [];
    appendPolicyChangeSummary(lines, summary, (text) => `<${text}>`);

    expect(policyChangeSection(summary)).toEqual([
      '',
      HEADING,
      '  exclude added: a/**',
      '  analyzer disabled: mutation',
    ]);
    expect(lines).toEqual([
      `<${HEADING}>`,
      '  exclude added: a/**',
      '  analyzer disabled: mutation',
    ]);
  });

  it('says in the heading that the loosening was accepted', () => {
    expect(
      policyChangeSection({ policyChanges: ['exclude added: a/**'], policyChangeAccepted: true }),
    ).toEqual([
      '',
      'Policy changed in this change (nitpicker.config.json, head against base; ' +
        'loosening accepted with --accept-policy-change):',
      '  exclude added: a/**',
    ]);
  });
});
