import type { TSESLint } from '@typescript-eslint/utils';
import type { ReportFix } from './ranges.mts';

type Descriptor<MessageId extends string> = TSESLint.ReportDescriptor<MessageId>;

type SuggestionPlan<MessageId extends string> = {
  readonly messageId: MessageId;
  readonly plan: ReportFix | undefined;
  readonly data?: Readonly<Record<string, unknown>>;
};

export function fixable<MessageId extends string>(
  descriptor: Descriptor<MessageId>,
  plan: ReportFix | undefined,
): Descriptor<MessageId> {
  return plan === undefined ? descriptor : { ...descriptor, fix: plan };
}

export function suggestible<MessageId extends string>(
  descriptor: Descriptor<MessageId>,
  { messageId, plan, data }: SuggestionPlan<MessageId>,
): Descriptor<MessageId> {
  if (plan === undefined) {
    return descriptor;
  }
  return {
    ...descriptor,
    suggest: [{ messageId, ...(data === undefined ? {} : { data }), fix: plan }],
  };
}
