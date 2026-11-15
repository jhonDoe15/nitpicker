import type { TSESLint } from '@typescript-eslint/utils';
import { resolveTestTimeouts as untypedResolveTestTimeouts } from '../../../../../../../../shared/test-timeouts/resolve.mjs';
import { fieldsOf, objectOf } from '../../../../../../../../shared/values/readers.mts';
import { readHeadPolicyFile } from '../../../typed/policy-views.mts';

export type TimeoutLimits = {
  readonly hookDeclarationCeilingMs: number;
  readonly testDeclarationCeilingMs: number;
};

type Policy = Readonly<Record<string, unknown>>;

const resolveTestTimeouts: (
  policy: Policy,
  subject: { readonly file: string; readonly language: string; readonly integration: boolean },
) => TimeoutLimits = untypedResolveTestTimeouts;

export function timeoutPolicy(settings: TSESLint.SharedConfigurationSettings): Policy {
  const configured = settings['nitpickerTestTimeoutPolicy'];
  return objectOf(configured) === undefined ? readHeadPolicyFile() : fieldsOf(configured);
}

export function timeoutLimits(policy: Policy, file: string, integration: boolean): TimeoutLimits {
  return resolveTestTimeouts(policy, {
    file,
    language: policy['preset'] === 'javascript' ? 'javascript' : 'typescript',
    integration,
  });
}
