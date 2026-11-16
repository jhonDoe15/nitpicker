import path from 'node:path';
import { expect } from 'vitest';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { hasSpecificGuidance } from '../../../diff/reporting/review/policy-guidance.mts';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mts';
import { policyChangeFields } from '../../describe-policy-changes.mts';
import { readPolicyScope } from '../../policy-scope.mts';
import type { PolicyConfig, ReplacedOptions } from '../../types/policy-types.mts';

type Files = Readonly<Record<string, string>>;
type Fields = ReturnType<typeof policyChangeFields>;

const { createGitRepository } = useGitFixtures();
const JAVA: PolicyConfig = { preset: 'java' };

function noReplacedOptions(): ReplacedOptions {
  return { rules: [] };
}

export function between({
  base,
  head,
  config = JAVA,
  baseConfig = config,
  folder = '.',
  replacedOptions = noReplacedOptions,
}: {
  readonly base: Files;
  readonly head: Files;
  readonly config?: PolicyConfig | undefined;
  readonly baseConfig?: PolicyConfig | undefined;
  readonly folder?: string;
  readonly replacedOptions?: (config: PolicyConfig, root: string) => ReplacedOptions;
}): Fields {
  const scope = readPolicyScope({
    baseConfig,
    headConfig: config,
    baseProjectRoot: path.join(createGitRepository(base).root, folder),
    headProjectRoot: path.join(createGitRepository(head).root, folder),
    liveProjectRoot: PACKAGE_ROOT,
    replacedOptions,
  });
  return guided(policyChangeFields(baseConfig, config, scope));
}

function guided(fields: Fields): Fields {
  for (const text of fields.policyLoosenings) {
    expect(hasSpecificGuidance(fields.policyKinds[text] ?? ''), text).toBe(true);
  }
  return fields;
}

export function changesOf({ policyLoosenings, policyChanges }: Fields): {
  policyLoosenings: string[];
  policyChanges: string[];
} {
  return { policyLoosenings, policyChanges };
}

export function without(files: Files, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([file]) => file !== name));
}
