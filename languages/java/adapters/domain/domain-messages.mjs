import { RULE_IDS } from '../../../../shared/policy.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';

const COUPLING_TOOL = 'coupling';

const LEADS = {
  [RULE_IDS.domainImportsIo]: ({ owner, used }) =>
    `Pass the results of I/O into ${owner} as values, or call a port the domain declares: it uses ${used}, which does file, network, thread or process work. Do that work in an adapter that implements the port.`,
  [RULE_IDS.domainImportsClient]: ({ owner, used, first }) =>
    `Reach databases, HTTP services and brokers through a port the domain declares, not from ${owner}: it uses ${used}. Declare a repository or gateway interface in the domain and implement it with ${first} in an adapter.`,
  [RULE_IDS.domainImportsLogger]: ({ owner, used }) =>
    `Return what happened from ${owner} instead of logging there: it uses ${used}. Return a result or a domain event and let the adapter or application layer log it.`,
  [RULE_IDS.domainImportsRandom]: ({ owner, used }) =>
    `Pass ids and random values into ${owner}: it uses ${used}. Take them as parameters, or through an id or random source port the domain declares and an adapter implements.`,
  [RULE_IDS.domainImportsFrameworkContext]: ({ owner, used }) =>
    `Take the collaborators of ${owner} as constructor parameters instead of looking them up: it uses ${used}. Let the composition root wire the domain.`,
};

const CONCERNS = {
  [RULE_IDS.domainImportsIo]: 'file, network, thread or process work',
  [RULE_IDS.domainImportsClient]: 'a database, HTTP or messaging client',
  [RULE_IDS.domainImportsLogger]: 'a logger',
};

export function domainFinding({ rule, file, identity }, message) {
  return {
    tool: COUPLING_TOOL,
    rule,
    path: file,
    identity,
    message: `${message} ${exceptionHint(`${COUPLING_TOOL}/${rule}`, file)}`,
    classification: 'enforceable',
  };
}

export function adapterMessage({ owner, used, packageName }) {
  return `Have ${owner} depend on a port the domain declares, not on adapter code: it uses ${used} from ${packageName}. Declare the interface ${owner} needs in the domain, implement it in the adapter, and let the composition root pass the implementation in.`;
}

export function libraryMessage(rule, values) {
  return LEADS[rule](values);
}

export function reachMessage({ owner, path, library, rule }) {
  return `Keep I/O behind a port the domain declares, also when a helper does it: ${owner} uses ${path.join(' -> ')}, which uses ${library}, ${CONCERNS[rule]}. Do that work in an adapter that implements the port, or pass its result into ${owner} as a value.`;
}
