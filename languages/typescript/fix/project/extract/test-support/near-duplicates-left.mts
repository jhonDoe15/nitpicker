import { reuseFindingsFor } from '../../reuse/reuse-findings.mts';
import type { FixedProject } from '../../test-support/fixture-project.mts';

export function remainingNearDuplicates(result: FixedProject): unknown[] {
  const context = {
    projectRoot: result.projectRoot,
    files: [],
    read: () => undefined,
    accepts: () => true,
  };
  return reuseFindingsFor(context, 'near-duplicate');
}
