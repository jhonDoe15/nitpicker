import path from 'node:path';
import { expect } from 'vitest';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { hasSpecificGuidance } from '../../../diff/reporting/review/policy-guidance.mjs';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from '../../describe-policy-changes.mjs';
import { readPolicyScope } from '../../policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
const JAVA = { preset: 'java' };

export function between({ base, head, config = JAVA, baseConfig = config, directory = '' }) {
  const scope = readPolicyScope({
    baseConfig,
    headConfig: config,
    baseProjectRoot: path.join(createGitRepository(base).root, directory),
    headProjectRoot: path.join(createGitRepository(head).root, directory),
    liveProjectRoot: PACKAGE_ROOT,
  });
  return guided(policyChangeFields(baseConfig, config, scope));
}

function guided(fields) {
  for (const text of fields.policyLoosenings) {
    expect(hasSpecificGuidance(fields.policyKinds[text]), text).toBe(true);
  }
  return fields;
}

export function changesOf({ policyLoosenings, policyChanges }) {
  return { policyLoosenings, policyChanges };
}

export function without(files, name) {
  return Object.fromEntries(Object.entries(files).filter(([file]) => file !== name));
}
