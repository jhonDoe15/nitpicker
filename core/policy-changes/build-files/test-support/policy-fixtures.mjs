import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from '../../describe-policy-changes.mjs';
import { readPolicyScope } from '../../policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
const JAVA = { preset: 'java' };

export function between({ base, head, config = JAVA }) {
  const scope = readPolicyScope({
    baseConfig: config,
    headConfig: config,
    baseProjectRoot: createGitRepository(base).root,
    headProjectRoot: createGitRepository(head).root,
  });
  return policyChangeFields(config, config, scope);
}

export function changesOf({ policyLoosenings, policyChanges }) {
  return { policyLoosenings, policyChanges };
}

export function without(files, name) {
  return Object.fromEntries(Object.entries(files).filter(([file]) => file !== name));
}
