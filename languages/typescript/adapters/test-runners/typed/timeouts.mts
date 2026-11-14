import type { TimeoutLimits } from './runner-types.mts';
import { resolveTestTimeouts as untypedResolveTestTimeouts } from '../../../../../shared/test-timeouts/resolve.mjs';

export type TimeoutPolicy = {
  readonly preset?: string;
  readonly tools?: { readonly tests?: { readonly timeouts?: unknown } };
};

export const resolveTestTimeouts: (
  policy: TimeoutPolicy,
  context: { readonly file: string | undefined; readonly language: string },
) => TimeoutLimits = untypedResolveTestTimeouts;
