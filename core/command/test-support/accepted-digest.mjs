import { policyDigest } from '../../diff/reporting/review/policy-findings.mjs';
import { gitBlobId } from '../../policy-changes/policy-scope.mjs';

export function acceptedDigest(loosenings, files) {
  return policyDigest({
    loosenings,
    files: Object.entries(files).map(([file, text]) => [file, gitBlobId(Buffer.from(text))]),
  });
}
