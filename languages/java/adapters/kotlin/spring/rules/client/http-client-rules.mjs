import { assignedName, assignmentsIn } from '../../syntax/expressions/kotlin-chains.mjs';
import { descendants, identifierOf, kids } from '../../syntax/kotlin-tree.mjs';
import { contextAt, outermostClass } from '../../syntax/expressions/kotlin-scope.mjs';
import { callsIn, receiverName } from '../../syntax/kotlin-calls.mjs';
import { REST_TEMPLATE } from '../../names/spring-clients.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { defineRule, hitOn, symbolAtNode } from '../rule-support.mjs';
import { clientSites, inSetup } from './http-client-sites.mjs';

const PER_CALL_KINDS = new Set(['template', 'template-builder', 'create', 'builder', 'jdk-new']);
const FACTORY_SETTINGS = new Set([
  'setConnectTimeout',
  'setReadTimeout',
  'setConnectionRequestTimeout',
  'connectTimeout',
  'readTimeout',
  'connectionRequestTimeout',
]);
const CHAIN_SETTINGS = {
  template: new Set(['setRequestFactory', 'requestFactory']),
  factory: FACTORY_SETTINGS,
  builder: new Set(['requestFactory', 'clientConnector', 'connectTimeout']),
  'template-builder': new Set([
    'connectTimeout',
    'readTimeout',
    'setConnectTimeout',
    'setReadTimeout',
    'requestFactory',
    'requestFactorySettings',
    'requestFactoryBuilder',
  ]),
  netty: new Set(['responseTimeout']),
};

function targetOf(file, { call, chain }) {
  const { parent } = chain;
  if (parent?.t === 'PROPERTY') {
    const local = call.ancestors.some((node) => node.t === 'FUN');
    return { name: identifierOf(file.source, parent), local };
  }
  if (parent?.t === 'BINARY_EXPRESSION' && kids(parent).at(-1) === chain.top) {
    const { receiver, member } = assignedName(file.source, kids(parent)[0]);
    return { name: receiver === 'this' ? member : (member ?? receiver), local: false };
  }
  return { name: undefined, local: false };
}

function scopeOf(site, target) {
  const { ancestors } = site.call;
  const declaration = ancestors.findLast((node) => node.t === 'FUN');
  return target.local && declaration !== undefined ? declaration : outermostClass(ancestors);
}

function setsOnChain(file, site, settings) {
  const { top } = site.chain;
  return (
    callsIn(file.source, top).some(
      (call) => call.node !== site.call.node && settings.has(call.name),
    ) ||
    assignmentsIn(file.source, descendants(top)).some(({ left }) =>
      settings.has(assignedName(file.source, left).member),
    )
  );
}

function setsOnTarget(file, site, settings) {
  const target = targetOf(file, site);
  const scope = scopeOf(site, target);
  if (target.name === undefined || scope === undefined) {
    return false;
  }
  return (
    callsIn(file.source, scope).some(
      (call) => settings.has(call.name) && receiverName(file.source, call.receiver) === target.name,
    ) ||
    assignmentsIn(file.source, descendants(scope)).some(({ left }) => {
      const { receiver, member } = assignedName(file.source, left);
      return receiver === target.name && settings.has(member);
    })
  );
}

function takesRestTemplate(file, site) {
  const context = contextAt(file, site.call.ancestors);
  return site.call.arguments.some(
    (argument) =>
      argument.t === 'VALUE_ARGUMENT' &&
      receiverMatches(context, { receiver: kids(argument)[0] }, REST_TEMPLATE),
  );
}

function missingTimeouts(file, site) {
  const noArguments = site.call.arguments.length === 0;
  const settings = CHAIN_SETTINGS[site.kind];
  switch (site.kind) {
    case 'jdk-new':
      return true;
    case 'create':
      return !takesRestTemplate(file, site);
    case 'connector':
      return noArguments;
    case 'netty':
      return !setsOnChain(file, site, settings) && !setsOnTarget(file, site, settings);
    case 'template':
    case 'factory':
      return (
        noArguments && !setsOnChain(file, site, settings) && !setsOnTarget(file, site, settings)
      );
    default:
      return noArguments && !setsOnChain(file, site, settings);
  }
}

const perCall = defineRule(
  'SpringHttpClientPerCall',
  'Build the HTTP client once, from the injected RestClient.Builder or RestTemplateBuilder, and keep it in a val or a @Bean. A client built in each call throws away its connection pool.',
  (file) =>
    clientSites(file)
      .filter(({ kind }) => PER_CALL_KINDS.has(kind))
      .filter((site) => !inSetup(file, site))
      .map((site) =>
        hitOn(site.call.node, `${symbolAtNode(file, site.call.ancestors)}@${site.call.name}`),
      ),
);

const timeouts = defineRule(
  'SpringHttpClientTimeouts',
  'Build this HTTP client with connect and read timeouts, from the injected RestClient.Builder or RestTemplateBuilder (spring.http.client.* properties), with a request factory or connector that sets them, or with connectTimeout and readTimeout on the builder; give a Reactor Netty HttpClient a responseTimeout. A client without timeouts waits forever for a slow server.',
  (file) =>
    clientSites(file)
      .filter((site) => inSetup(file, site))
      .filter((site) => missingTimeouts(file, site))
      .map((site) =>
        hitOn(site.call.node, `${symbolAtNode(file, site.call.ancestors)}@${site.call.name}`),
      ),
);

export const CLIENT_RULES = [perCall, timeouts];
