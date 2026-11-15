import type { Finding } from '../../../../../../shared/values/findings.mts';
import { fanOutFindings as untypedFanOutFindings } from '../../../kotlin/review-rules/main/fan-out/fan-out.mjs';
import { withKotlinRuleMessage as untypedWithKotlinRuleMessage } from '../../../kotlin/rules/kotlin-messages.mjs';

export const fanOutFindings: (input: {
  readonly own: unknown;
  readonly projectFiles: unknown;
  readonly projectRoot: string;
  readonly javaRoots: string[];
}) => { readonly findings: Finding[] } = untypedFanOutFindings;

export const withKotlinRuleMessage: (finding: Finding) => Finding = untypedWithKotlinRuleMessage;
