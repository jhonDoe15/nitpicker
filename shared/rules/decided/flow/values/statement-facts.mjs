import { assignedFacts } from './assignments.mjs';

export function statementFacts(node, flow) {
  return assignedFacts(node, flow);
}
