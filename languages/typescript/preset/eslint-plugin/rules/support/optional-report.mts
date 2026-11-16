import type { TSESLint } from '@typescript-eslint/utils';

export function optionalReporter<MessageId extends string>(
  context: Readonly<TSESLint.RuleContext<MessageId, readonly unknown[]>>,
): (descriptor: TSESLint.ReportDescriptor<MessageId> | undefined) => void {
  return (descriptor) => {
    if (descriptor !== undefined) {
      context.report(descriptor);
    }
  };
}
