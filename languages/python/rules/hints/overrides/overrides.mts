import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

function describeOverride(subject: string): string {
  const [member = '', base = ''] = subject.split('|');
  const name = member.split('.').pop() ?? member;
  return `\`${member}\` replaces \`${base}.${name}\` without calling \`super().${name}\`: what the base member keeps (shared state, registration, saving or validation) is skipped, while the other overrides of it in this project and the contract of the base build on it`;
}

export const OVERRIDE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['override-without-super'],
    describe: describeOverride,
    allowed:
      'Call the base member and combine its result with yours: `return super().available and self.coordinator.last_update_success` for a property, `super().save(*args, **kwargs)` for a method (and `super().setUp()` in a test fixture). An exception fits only when this class intentionally replaces the base behaviour.',
  },
];
