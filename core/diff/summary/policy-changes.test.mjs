import { describe, expect, it } from 'vitest';
import { appendPolicyChangeSummary, policyChangeSection } from './policy-changes.mjs';

describe('policy change rendering', () => {
  it('renders nothing without changes', () => {
    const lines = ['kept'];
    appendPolicyChangeSummary(lines, [], (text) => `<${text}>`);
    appendPolicyChangeSummary(lines, undefined, (text) => `<${text}>`);

    expect(policyChangeSection()).toEqual([]);
    expect(policyChangeSection([])).toEqual([]);
    expect(lines).toEqual(['kept']);
  });

  it('renders a heading and one indented line per change', () => {
    const changes = ['exclude added: a/**', 'analyzer disabled: mutation'];
    const lines = [];
    appendPolicyChangeSummary(lines, changes, (text) => `<${text}>`);

    expect(policyChangeSection(changes)).toEqual([
      '',
      'Policy changed in this change (nitpicker.config.json, head against base):',
      '  exclude added: a/**',
      '  analyzer disabled: mutation',
    ]);
    expect(lines).toEqual([
      '<Policy changed in this change (nitpicker.config.json, head against base):>',
      '  exclude added: a/**',
      '  analyzer disabled: mutation',
    ]);
  });
});
