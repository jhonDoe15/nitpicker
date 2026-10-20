import { describe, expect, it } from 'vitest';
import {
  resolveHeadPolicy,
  withHeadPolicyFile,
  readHeadPolicy,
  readLayout,
} from './head-policy.mjs';

describe('head policy duplicates key', () => {
  it('is left out of the policy until the config sets it and read back as an empty object', () => {
    expect(resolveHeadPolicy({})).toEqual({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
    });
    withHeadPolicyFile(resolveHeadPolicy({}), (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).duplicates).toEqual({});
      expect(readLayout({ NITPICKER_POLICY: policyFile }).duplicateSkippedFolders).toBeUndefined();
    });
  });

  it('carries the skipped folders to the readers of the policy file and the layout', () => {
    const policy = resolveHeadPolicy({ duplicates: { skippedFolders: ['dist'] } });

    expect(policy.duplicates).toEqual({ skippedFolders: ['dist'] });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).duplicates).toEqual({
        skippedFolders: ['dist'],
      });
      expect(readLayout({ NITPICKER_POLICY: policyFile }).duplicateSkippedFolders).toEqual([
        'dist',
      ]);
    });
  });
});
