import { assignedFacts } from './assignments.mts';
import { preconditionFacts } from './preconditions.mts';
import type { Fact, Flow, FlowNode } from '../../typed/decided-types.mts';

export function statementFacts(node: FlowNode, flow: Flow): Fact[] {
  return [...assignedFacts(node, flow), ...preconditionFacts(node, flow)];
}
