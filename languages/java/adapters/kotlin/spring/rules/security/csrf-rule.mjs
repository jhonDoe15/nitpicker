import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { assignedName, assignmentsIn, chainOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { descendants, textOf } from '../../syntax/kotlin-tree.mjs';
import { defineRule, hitOn, memberSymbolOf } from '../rule-support.mjs';
import { rootedNodes, terminalCall } from './chain-support.mjs';

const STATELESS_REPOSITORIES =
  /\b(?:NullSecurityContextRepository|NoOpServerSecurityContextRepository)\b/;
const LOGINS = new Set(['formLogin', 'httpBasic', 'rememberMe', 'oauth2Login', 'saml2Login']);
const TOKEN_KINDS = new Set(['jwt', 'opaqueToken']);

function disables(file, call) {
  return (
    call.arguments.some(
      (argument) =>
        descendants(argument, (node) => node.t === 'CALLABLE_REFERENCE_EXPRESSION').some((node) =>
          textOf(file.source, node).endsWith('::disable'),
        ) || callsIn(file.source, argument).some((inner) => inner.name === 'disable'),
    ) || callsIn(file.source, chainOf(call).top).some((inner) => inner.name === 'disable')
  );
}

function disablesCsrf(file, call) {
  if (call.reference) {
    return false;
  }
  if (call.name === 'csrf') {
    return call.arguments.some(
      (argument) =>
        callsIn(file.source, argument).some((inner) => inner.name === 'disable') ||
        textOf(file.source, argument).endsWith('::disable'),
    );
  }
  const before = call.receiver === undefined ? undefined : terminalCall(file.source, call.receiver);
  return call.name === 'disable' && before?.name === 'csrf' && before.arguments.length === 0;
}

function statelessSession(file, calls, assignments) {
  return (
    calls.some(
      (call) =>
        call.name === 'sessionCreationPolicy' &&
        descendants(call.node, (node) => textOf(file.source, node) === 'STATELESS').length > 0,
    ) ||
    assignments.some(
      ({ left, right }) =>
        assignedName(file.source, left).member === 'sessionCreationPolicy' &&
        textOf(file.source, right).endsWith('STATELESS'),
    )
  );
}

function stateless(file, calls, assignments) {
  return (
    statelessSession(file, calls, assignments) ||
    calls.some(
      (call) =>
        ['securityContext', 'securityContextRepository'].includes(call.name) &&
        STATELESS_REPOSITORIES.test(textOf(file.source, call.node)),
    ) ||
    assignments.some(
      ({ left, right }) =>
        assignedName(file.source, left).member === 'securityContextRepository' &&
        STATELESS_REPOSITORIES.test(textOf(file.source, right)),
    )
  );
}

function tokenOnly(file, calls) {
  const resourceServer = calls.filter((call) => call.name === 'oauth2ResourceServer');
  const tokens = resourceServer.some((call) =>
    callsIn(file.source, call.node).some((inner) => TOKEN_KINDS.has(inner.name)),
  );
  return (
    tokens &&
    !calls.some((call) => LOGINS.has(call.name) && !call.reference && !disables(file, call))
  );
}

const csrfDisabled = defineRule(
  'SpringCsrfDisabled',
  'Keep CSRF protection on for session-based security. Turn it off only for a stateless API, in the same filter chain: SessionCreationPolicy.STATELESS or a NullSecurityContextRepository on servlet security, NoOpServerSecurityContextRepository on WebFlux, or oauth2ResourceServer with jwt or opaqueToken and every login form disabled.',
  (file) =>
    file.functions
      .filter((declaration) => declaration.body !== undefined)
      .flatMap((declaration) => {
        const nodes = rootedNodes(file, declaration);
        const all = callsIn(file.source, declaration.body);
        function rootOf(node) {
          return nodes.find((entry) => entry.node === node)?.root;
        }
        return all
          .filter((call) => disablesCsrf(file, call))
          .filter((call) => {
            const root = rootOf(call.node);
            const rooted = all.filter((other) => rootOf(other.node) === root);
            const assignments = assignmentsIn(
              file.source,
              nodes.filter((entry) => entry.root === root).map(({ node }) => node),
            );
            return !(stateless(file, rooted, assignments) || tokenOnly(file, rooted));
          })
          .map((call) => hitOn(chainOf(call).start, `${memberSymbolOf(declaration)}@csrf`));
      }),
);

export const CSRF_RULES = [csrfDisabled];
