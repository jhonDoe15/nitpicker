import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { isNode } from '../../eslint-plugin/rules/typed/node-views.mts';
import { GUARDED_FIX_MESSAGE } from './guard-message.mts';

export type Descriptor = TSESLint.ReportDescriptor<string>;
export type GuardContext = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
export type Guard = (descriptor: Descriptor, context: GuardContext) => Descriptor;
export type GuardStatus = 'automatic' | 'review' | 'none';
export type FixGuard = { readonly status: GuardStatus; readonly guard: Guard };

export function keptFix(descriptor: Descriptor): Descriptor {
  return descriptor;
}

export function unfixed(descriptor: Descriptor): Descriptor {
  const { fix: _fix, suggest: _suggest, ...rest } = descriptor;
  return rest;
}

export function demoted(descriptor: Descriptor): Descriptor {
  const { fix, ...rest } = descriptor;
  if (fix === undefined || fix === null) {
    return descriptor;
  }
  return { ...rest, suggest: [{ messageId: GUARDED_FIX_MESSAGE, fix }] };
}

export function reportedNode(descriptor: Descriptor, messageId: string): TSESTree.Node | undefined {
  return 'node' in descriptor && descriptor.messageId === messageId && isNode(descriptor.node)
    ? descriptor.node
    : undefined;
}
