import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadCheckoutFacts as untypedWithHeadCheckoutFacts,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../../preset/head-policy.mjs';

export const resolveHeadPolicy: (config: object, projectRoot: string | undefined) => object =
  untypedResolveHeadPolicy;

export const withHeadCheckoutFacts: (policy: object, headPolicy: object) => object =
  untypedWithHeadCheckoutFacts;

export const withHeadPolicyFile: <T>(policy: object, run: (policyFile: string) => T) => T =
  untypedWithHeadPolicyFile;
