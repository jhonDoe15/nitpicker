import { argumentValue } from '../../syntax/kotlin-annotations.mjs';
import { callsIn, walk } from '../../syntax/kotlin-calls.mjs';
import {
  assignedName,
  assignmentsIn,
  operatorOf,
} from '../../syntax/expressions/kotlin-chains.mjs';
import { enclosingFunction, outermostClass } from '../../syntax/expressions/kotlin-scope.mjs';
import { plainText } from '../../syntax/expressions/kotlin-strings.mjs';
import { descendants, kids, textOf } from '../../syntax/kotlin-tree.mjs';
import { CROSS_ORIGIN } from '../../names/spring-annotations.mjs';
import { defineRule, hitOn, sitesOfType, symbolAtNode } from '../rule-support.mjs';
import { terminalCall } from './chain-support.mjs';

const ORIGIN_CALLS = new Set([
  'setAllowedOrigins',
  'setAllowedOriginPatterns',
  'allowedOrigins',
  'allowedOriginPatterns',
  'addAllowedOrigin',
  'addAllowedOriginPattern',
]);
const ORIGIN_PROPERTIES = new Set(['allowedOrigins', 'allowedOriginPatterns']);
const CREDENTIAL_CALLS = new Set(['setAllowCredentials', 'allowCredentials']);
const TRUE_VALUES = new Set(['true', 'Boolean.TRUE', 'java.lang.Boolean.TRUE']);

function wildcards(file, root) {
  return descendants(root, (node) => node.t === 'STRING_TEMPLATE').filter(
    (node) => plainText(file.source, node) === '*',
  );
}

function originValues(file, node) {
  if (node.t === 'CALL_EXPRESSION') {
    const call = terminalCall(file.source, node);
    return ORIGIN_CALLS.has(call.name) ? { name: call.name, values: call.arguments } : undefined;
  }
  if (node.t === 'BINARY_EXPRESSION' && operatorOf(file.source, node) === '=') {
    const { member } = assignedName(file.source, kids(node)[0]);
    return ORIGIN_PROPERTIES.has(member)
      ? { name: member, values: [kids(node).at(-1)] }
      : undefined;
  }
  return undefined;
}

function originSites(file) {
  return walk(file.tree).flatMap(({ node, ancestors }) => {
    const origins = originValues(file, node);
    return origins === undefined
      ? []
      : origins.values.flatMap((value) =>
          wildcards(file, value).map((wildcard) => ({
            node: wildcard,
            ancestors,
            name: origins.name,
          })),
        );
  });
}

function allowsCredentials(file, scope) {
  return (
    callsIn(file.source, scope).some(
      (call) =>
        CREDENTIAL_CALLS.has(call.name) &&
        call.arguments.some((argument) => TRUE_VALUES.has(textOf(file.source, argument))),
    ) ||
    assignmentsIn(file.source, descendants(scope)).some(
      ({ left, right }) =>
        assignedName(file.source, left).member === 'allowCredentials' &&
        TRUE_VALUES.has(textOf(file.source, right)),
    )
  );
}

function scopeOf(file, ancestors) {
  return enclosingFunction(file, ancestors)?.node ?? outermostClass(ancestors) ?? file.tree;
}

function annotationSites(file) {
  return sitesOfType(file, CROSS_ORIGIN)
    .filter(({ annotation }) =>
      ['true', '"true"'].includes(argumentValue(annotation, 'allowCredentials')?.text),
    )
    .flatMap((site) =>
      ['value', 'origins', 'originPatterns']
        .map((name) => argumentValue(site.annotation, name)?.node)
        .filter((value) => value !== undefined)
        .flatMap((value) => wildcards(file, value))
        .map((node) => hitOn(node, `${site.symbol}@CrossOrigin`)),
    );
}

const corsWildcard = defineRule(
  'SpringCorsWildcard',
  'List the allowed origins from configuration instead of "*" when credentials are allowed; any site could then call this API as the signed-in user.',
  (file) => [
    ...originSites(file)
      .filter((site) => allowsCredentials(file, scopeOf(file, site.ancestors)))
      .map((site) => hitOn(site.node, `${symbolAtNode(file, site.ancestors)}@${site.name}`)),
    ...annotationSites(file),
  ],
);

export const CORS_RULES = [corsWildcard];
