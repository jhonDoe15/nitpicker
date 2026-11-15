import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadCheckoutFacts as untypedWithHeadCheckoutFacts,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../../preset/head-policy.mjs';

export type ResolvedHeadPolicy = {
  readonly preset?: string;
  readonly tools: Readonly<Record<string, unknown>>;
};

export const resolveHeadPolicy: (config: object, projectRoot?: string) => ResolvedHeadPolicy =
  untypedResolveHeadPolicy;

export const withHeadCheckoutFacts: (
  policy: ResolvedHeadPolicy,
  headPolicy: ResolvedHeadPolicy,
) => ResolvedHeadPolicy = untypedWithHeadCheckoutFacts;

export const withHeadPolicyFile: <T>(
  policy: ResolvedHeadPolicy,
  operation: (policyFile: string) => T,
) => T = untypedWithHeadPolicyFile;
