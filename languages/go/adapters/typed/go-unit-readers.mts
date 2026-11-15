import { goUnitFacts as untypedGoUnitFacts } from '../near-duplicates/go-unit-facts.mjs';
import type { GoUnitFact, InspectReport } from '../go-types.mts';

export const goUnitFacts: (
  projectRoot: string,
  report: Pick<InspectReport, 'files'>,
) => GoUnitFact[] = untypedGoUnitFacts;
