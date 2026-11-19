import type { Finding } from '../../../../../../shared/values/findings.mts';
import { callUntyped } from '../../../typed/java-values.mts';
import { findingsOf } from '../../../kotlin/rules/test-support/findings-list.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { fanOutFindings as untypedFanOutFindings } from '../../../kotlin/review-rules/main/fan-out/fan-out.mts';
import { withKotlinRuleMessage as untypedWithKotlinRuleMessage } from '../../../kotlin/rules/kotlin-messages.mts';

export function fanOutFindings(input: {
  readonly own: unknown;
  readonly projectFiles: unknown;
  readonly projectRoot: string;
  readonly javaRoots: string[];
}): { readonly findings: Finding[] } {
  return { findings: findingsOf(fieldOf(callUntyped(untypedFanOutFindings, input), 'findings')) };
}

export function withKotlinRuleMessage(finding: Finding): Finding {
  const [first] = findingsOf([callUntyped(untypedWithKotlinRuleMessage, finding)]);
  if (first === undefined) {
    throw new TypeError('The rule message was not applied');
  }
  return first;
}
