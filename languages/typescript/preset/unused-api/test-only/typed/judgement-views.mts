import type { Finding } from '../../../../../../shared/values/findings.mts';
import {
  TYPESCRIPT_TEST_ONLY_MESSAGES as untypedMessages,
  testOnlyFindings as untypedTestOnlyFindings,
} from '../../../../../../shared/rules/test-only/test-only-judgement.mjs';
import type { KnipItem } from './knip-types.mts';

export const TYPESCRIPT_TEST_ONLY_MESSAGES: unknown = untypedMessages;

export const testOnlyFindings: (
  items: readonly KnipItem[],
  context: {
    readonly analyzerName: string;
    readonly isExcepted: (rule: string, ...candidates: readonly unknown[]) => boolean;
    readonly isPublished: (file: string) => boolean;
    readonly messages: unknown;
  },
) => Finding[] = untypedTestOnlyFindings;
