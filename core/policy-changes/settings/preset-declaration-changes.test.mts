import { describe, expect, it } from 'vitest';
import { describePolicyChanges } from '../describe-policy-changes.mts';
import { createPolicyScope } from '../policy-scope.mts';

describe('describePolicyChanges for a declared preset', () => {
  it('does not count declaring the preset a project without scripts has to declare', () => {
    const head = { preset: 'python' };
    const scope = createPolicyScope({
      files: [],
      baseRoots: {},
      headRoots: {},
      headConfig: head,
      presetRequired: true,
    });

    expect(describePolicyChanges({}, head, scope)).toEqual({
      loosened: [],
      changed: ['preset: not set -> "python"'],
    });
  });
});
