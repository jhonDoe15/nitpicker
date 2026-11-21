import type { Finding } from '../../values/findings.mts';
import { fieldOf, listOf } from '../../values/readers.mts';
import type { EvaluatorInput, FactEvaluator, FactPolicy } from '../facts/typed/evaluate-types.mts';
import type { DesignFinding, DesignIndex, ProtocolContract } from './typed/design-types.mts';
import { DESIGN_RULE_IDS } from '../../project-rules/design/design-rules.mts';
import { repeatedProtocolFindings } from './calls/caller-protocol.mts';
import { forwardingChainFindings } from './calls/forwarding-chain.mts';
import { protocolContractFindings } from './calls/protocol-contracts.mts';
import { foreignStateDecisionFindings } from './decisions/foreign-state-decision.mts';
import { repeatedPolicyDecisionFindings } from './decisions/repeated-policy-decision.mts';
import { designFindingFactory } from './design-finding.mts';
import { designIndex } from './design-index.mts';
import { contextThreadingFindings } from './state/context-threading.mts';
import { mutableStateEscapeFindings } from './state/mutable-state-escape.mts';
import { dataClumpFindings } from './surface/data-clump.mts';
import { disjointConsumerGroupFindings } from './surface/disjoint-consumer-groups.mts';

type DesignRule = (index: DesignIndex, finding: DesignFinding, policy: FactPolicy) => Finding[];

function isContract(value: unknown): value is ProtocolContract {
  return typeof fieldOf(value, 'type') === 'string' && Array.isArray(fieldOf(value, 'open'));
}

const RULES: Readonly<Record<string, DesignRule>> = {
  [DESIGN_RULE_IDS.mutableStateEscape]: mutableStateEscapeFindings,
  [DESIGN_RULE_IDS.contextThreading]: contextThreadingFindings,
  [DESIGN_RULE_IDS.callerProtocol]: repeatedProtocolFindings,
  [DESIGN_RULE_IDS.protocolContract]: (index, finding, policy) =>
    protocolContractFindings(index, finding, listOf(policy.protocols).filter(isContract)),
  [DESIGN_RULE_IDS.forwardingChain]: forwardingChainFindings,
  [DESIGN_RULE_IDS.disjointConsumerGroups]: disjointConsumerGroupFindings,
  [DESIGN_RULE_IDS.dataClump]: dataClumpFindings,
  [DESIGN_RULE_IDS.repeatedPolicyDecision]: repeatedPolicyDecisionFindings,
  [DESIGN_RULE_IDS.foreignStateDecision]: foreignStateDecisionFindings,
};

export const DESIGN_EVALUATORS: Readonly<Record<string, FactEvaluator>> = Object.fromEntries(
  Object.entries(RULES).map(([rule, findings]) => [
    rule,
    ({ facts, context, options }: EvaluatorInput) =>
      findings(designIndex(facts), designFindingFactory(context), options.policy),
  ]),
);
