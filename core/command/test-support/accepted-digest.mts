import { policyDigest } from '../../diff/reporting/review/policy-findings.mts';
import { gitBlobId } from '../../policy-changes/policy-scope.mts';

export function acceptedDigest(loosenings: string[], files: Record<string, string>): string {
  return policyDigest({
    loosenings,
    files: Object.entries(files).map(([file, text]) => [file, gitBlobId(Buffer.from(text))]),
  });
}
