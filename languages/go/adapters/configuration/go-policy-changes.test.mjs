import { describe, expect, it } from 'vitest';
import { describePolicyChanges } from '../../../../core/policy-changes/describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from '../../../../core/policy-changes/policy-scope.mjs';

function changes(baseConfig, headConfig) {
  return describePolicyChanges(
    baseConfig,
    headConfig,
    createPolicyScope({
      files: [],
      baseFiles: [],
      baseRoots: rootSets(baseConfig, '.'),
      headRoots: rootSets(headConfig, '.'),
      headConfig,
    }),
  );
}

describe('go policy changes', () => {
  it('counts a go formatter or build tag the change drops, not one it adds', () => {
    expect(
      changes(
        { preset: 'go', go: { formatters: ['gofumpt', 'goimports'], buildTags: ['integration'] } },
        { preset: 'go', go: { formatters: ['goimports'] } },
      ),
    ).toEqual({
      loosened: [
        'go.formatters: ["gofumpt","goimports"] -> ["goimports"]',
        'go.buildTags: ["integration"] -> not set',
      ],
      changed: [],
    });
    expect(
      changes(
        { preset: 'go', go: { formatters: ['gofmt'] } },
        { preset: 'go', go: { formatters: ['gofumpt'], buildTags: ['e2e'] } },
      ),
    ).toEqual({
      loosened: [],
      changed: ['go.formatters: ["gofmt"] -> ["gofumpt"]', 'go.buildTags: not set -> ["e2e"]'],
    });
  });
});
