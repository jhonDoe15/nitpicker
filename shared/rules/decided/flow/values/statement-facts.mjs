import { assignedFacts } from './assignments.mjs';
import { preconditionFacts } from './preconditions.mjs';

export function statementFacts(node, flow) {
  return [...assignedFacts(node, flow), ...preconditionFacts(node, flow)];
}
