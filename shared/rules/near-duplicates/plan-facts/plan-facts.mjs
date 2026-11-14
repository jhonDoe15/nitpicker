import { parameterFacts } from './hole-text.mjs';
import { suggestedPlace } from './placement.mjs';

function copyOf(unit, run) {
  return {
    path: unit.file,
    symbol: unit.name,
    startLine: unit.start,
    endLine: unit.end,
    ...(run === undefined ? {} : { run: { startLine: run.start, endLine: run.end } }),
  };
}

/**
 * What the fix plan of a near-duplicate finding needs and the message does not say: the copies
 * (the reported one first), the values that differ, and where the extracted function may go.
 */
export function nearDuplicatePlanFacts(finding, pair, layout) {
  const [here, other] = pair;
  return {
    verdict: finding.verdict,
    copies: [copyOf(here, finding.run?.[here.side]), copyOf(other, finding.run?.[other.side])],
    parameters: parameterFacts(finding.parameters ?? [], here.side),
    place: suggestedPlace([here.file, other.file], layout),
  };
}
