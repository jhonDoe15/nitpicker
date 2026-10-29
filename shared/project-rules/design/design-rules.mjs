export const DESIGN_RULE_IDS = {
  mutableStateEscape: 'mutable-state-escape',
  contextThreading: 'context-threading',
  callerProtocol: 'caller-protocol',
  protocolContract: 'protocol-contract',
  forwardingChain: 'forwarding-chain',
  disjointConsumerGroups: 'disjoint-consumer-groups',
  dataClump: 'data-clump',
  repeatedPolicyDecision: 'repeated-policy-decision',
  foreignStateDecision: 'foreign-state-decision',
};

export const DESIGN_RULES = Object.values(DESIGN_RULE_IDS);

const DESIGN_LISTS = ['modules', 'types', 'callables'];

export const DESIGN_RULE_LISTS = Object.fromEntries(
  DESIGN_RULES.map((rule) => [rule, DESIGN_LISTS]),
);

export const DESIGN_RULE_LANGUAGES = {
  typescript: true,
  javascript: 'partial',
  java: false,
  python: false,
  kotlin: true,
};

export const DESIGN_RULE_SETTINGS = { [DESIGN_RULE_IDS.protocolContract]: ['protocols'] };

const FAILING_DESIGN_RULES = new Set([
  DESIGN_RULE_IDS.mutableStateEscape,
  DESIGN_RULE_IDS.protocolContract,
]);

export const REPORT_ONLY_DESIGN_RULES = DESIGN_RULES.filter(
  (rule) => !FAILING_DESIGN_RULES.has(rule),
);

const LIMITS = {
  mutableStateEscape:
    'a caller in another module changes (push, add, put, an element assignment...) the value an exported member returned, and that value is a private mutable field of the owner of that member; return a copy or add the operation to the owner',
  contextThreading:
    'report-only: a parameter of a project type with 5 or more fields passed whole through 2 or more callables, one in another module, that together read at most a third of its fields',
  callerProtocol:
    'report-only: the same 3 or more steps on one value of a project class repeated by 3 or more callables in 2 or more modules',
  protocolContract:
    'a call that breaks a lifecycle the project lists in `protocols`: an `open` member without a `close` member on every exit, or a listed step before `open`',
  forwardingChain:
    'report-only: 2 or more forwarding hops in a row, each into another module, that pass the same parameters in order and return the result unchanged, with the same parameter and return types',
  disjointConsumerGroups:
    'report-only: the exported members of one module or class, used from other modules, split into 2 or more groups of 2 or more members that no caller module uses together and that share no field or helper',
  dataClump:
    'report-only: the same 3 or more typed parameters (names and types) in 3 or more exported functions of 2 or more modules',
  repeatedPolicyDecision:
    'report-only: two decisions in different modules over the same enum or field that group its constants the same way, with an arm covering 2 or more constants',
  foreignStateDecision:
    'report-only: 2 or more functions outside a class with behaviour that branch on the same 2 or more of its fields',
};

export function designRules(ids) {
  return Object.entries(LIMITS).map(([key, limit]) => ({
    id: ids[key],
    check: 'structure',
    limit,
    reportOnly: !FAILING_DESIGN_RULES.has(ids[key]),
  }));
}
