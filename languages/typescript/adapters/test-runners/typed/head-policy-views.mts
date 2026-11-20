import type { HeadConfig, HeadPolicyFile } from '../../../preset/typed/head-policy-types.mts';
import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadCheckoutFacts as untypedWithHeadCheckoutFacts,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../../preset/head-policy.mts';

export const resolveHeadPolicy: (config?: HeadConfig, projectRoot?: string) => HeadPolicyFile =
  untypedResolveHeadPolicy;

export const withHeadCheckoutFacts: (
  policy: HeadPolicyFile,
  headPolicy?: HeadPolicyFile,
) => HeadPolicyFile = untypedWithHeadCheckoutFacts;

export const withHeadPolicyFile: <T>(policy: HeadPolicyFile, run: (policyFile: string) => T) => T =
  untypedWithHeadPolicyFile;
