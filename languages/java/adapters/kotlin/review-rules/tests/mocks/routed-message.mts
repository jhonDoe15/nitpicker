import { findingFactory } from '../../review-finding.mts';
import type { FindingInput } from '../../typed/review-finding-types.mts';

export function routedMessage(
  input: Pick<FindingInput, 'rule' | 'file' | 'line' | 'message'>,
): string {
  return findingFactory()({ ...input, symbol: '' }).message;
}
