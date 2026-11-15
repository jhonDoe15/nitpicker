import {
  headPolicyEnvironment as untypedHeadPolicyEnvironment,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../head-policy.mjs';

export type PolicyInput = Readonly<Record<string, unknown>>;

export const headPolicyEnvironment: (policyFile: string) => NodeJS.ProcessEnv =
  untypedHeadPolicyEnvironment;

export const withHeadPolicyFile: <Result>(
  policy: PolicyInput,
  operation: (policyFile: string) => Result,
) => Result = untypedWithHeadPolicyFile;

export const resolveHeadPolicy: (config: PolicyInput, projectRoot?: string) => PolicyInput =
  untypedResolveHeadPolicy;
