import type { TimeoutLimits } from './runner-types.mts';
import { resolveTestTimeouts as untypedResolveTestTimeouts } from '../../../../../shared/test-timeouts/resolve.mjs';
import { isIntegrationTestFor as untypedIsIntegrationTestFor } from '../../../preset/layout/end-to-end-tests.mjs';

export type TimeoutPolicy = {
  readonly preset?: string;
  readonly tools?: { readonly tests?: { readonly timeouts?: unknown } };
};

export const resolveTestTimeouts: (
  policy: TimeoutPolicy,
  context: {
    readonly file: string | undefined;
    readonly language: string;
    readonly integration?: boolean;
  },
) => TimeoutLimits = untypedResolveTestTimeouts;

export const isIntegrationTestFor: (file: string | undefined, policy: TimeoutPolicy) => boolean =
  untypedIsIntegrationTestFor;
