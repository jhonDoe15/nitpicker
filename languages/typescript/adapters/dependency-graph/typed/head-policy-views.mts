import {
  resolveHeadPolicy,
  withHeadCheckoutFacts,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../../preset/head-policy.mts';
import type { HeadPolicyFile } from '../../../preset/typed/head-policy-types.mts';

export type ResolvedHeadPolicy = HeadPolicyFile;

export { resolveHeadPolicy, withHeadCheckoutFacts };

export const withHeadPolicyFile: <T>(
  policy: ResolvedHeadPolicy,
  operation: (policyFile: string) => T,
) => T = untypedWithHeadPolicyFile;
