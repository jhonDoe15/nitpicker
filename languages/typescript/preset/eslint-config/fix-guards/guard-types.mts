import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { isNode } from '../../eslint-plugin/rules/typed/node-views.mts';

export type Descriptor = TSESLint.ReportDescriptor<string>;
export type GuardContext = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
export type Guard = (descriptor: Descriptor, context: GuardContext) => Descriptor;
export type GuardStatus = 'automatic' | 'review' | 'none';
export type FixGuard = { readonly status: GuardStatus; readonly guard: Guard };

export const GUARDED_FIX_MESSAGE = 'nitpickerGuardedFix';

export function keptFix(descriptor: Descriptor): Descriptor {
  return descriptor;
}

export function unfixed(descriptor: Descriptor): Descriptor {
  return { ...descriptor, fix: null, suggest: null };
}

export function demoted(descriptor: Descriptor): Descriptor {
  const { fix } = descriptor;
  if (fix === undefined || fix === null) {
    return descriptor;
  }
  return { ...descriptor, fix: null, suggest: [{ messageId: GUARDED_FIX_MESSAGE, fix }] };
}

export function withSuggestions(
  descriptor: Descriptor,
  keeps: (messageId: string, index: number) => boolean,
): Descriptor {
  const suggest = (descriptor.suggest ?? []).filter(({ messageId }, index) =>
    keeps(messageId, index),
  );
  return { ...descriptor, suggest };
}

export function reportedNode(descriptor: Descriptor, messageId: string): TSESTree.Node | undefined {
  return 'node' in descriptor && descriptor.messageId === messageId && isNode(descriptor.node)
    ? descriptor.node
    : undefined;
}
