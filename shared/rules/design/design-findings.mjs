import { DESIGN_RULE_IDS } from '../../project-rules/design/design-rules.mjs';
import { repeatedProtocolFindings } from './calls/caller-protocol.mjs';
import { forwardingChainFindings } from './calls/forwarding-chain.mjs';
import { protocolContractFindings } from './calls/protocol-contracts.mjs';
import { foreignStateDecisionFindings } from './decisions/foreign-state-decision.mjs';
import { repeatedPolicyDecisionFindings } from './decisions/repeated-policy-decision.mjs';
import { designFindingFactory } from './design-finding.mjs';
import { designIndex } from './design-index.mjs';
import { contextThreadingFindings } from './state/context-threading.mjs';
import { mutableStateEscapeFindings } from './state/mutable-state-escape.mjs';
import { dataClumpFindings } from './surface/data-clump.mjs';
import { disjointConsumerGroupFindings } from './surface/disjoint-consumer-groups.mjs';

const RULES = {
  [DESIGN_RULE_IDS.mutableStateEscape]: mutableStateEscapeFindings,
  [DESIGN_RULE_IDS.contextThreading]: contextThreadingFindings,
  [DESIGN_RULE_IDS.callerProtocol]: (index, finding, policy) => [
    ...protocolContractFindings(index, finding, policy.protocols ?? []),
    ...repeatedProtocolFindings(index, finding),
  ],
  [DESIGN_RULE_IDS.forwardingChain]: forwardingChainFindings,
  [DESIGN_RULE_IDS.disjointConsumerGroups]: disjointConsumerGroupFindings,
  [DESIGN_RULE_IDS.dataClump]: dataClumpFindings,
  [DESIGN_RULE_IDS.repeatedPolicyDecision]: repeatedPolicyDecisionFindings,
  [DESIGN_RULE_IDS.foreignStateDecision]: foreignStateDecisionFindings,
};

export const DESIGN_EVALUATORS = Object.fromEntries(
  Object.entries(RULES).map(([rule, findings]) => [
    rule,
    ({ facts, context, options }) =>
      findings(designIndex(facts), designFindingFactory(context), options.policy),
  ]),
);
