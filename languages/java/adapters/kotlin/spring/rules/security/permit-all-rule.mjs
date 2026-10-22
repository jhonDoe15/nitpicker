import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { chainOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { plainText } from '../../syntax/expressions/kotlin-strings.mjs';
import { textOf } from '../../syntax/kotlin-tree.mjs';
import { defineRule, hitOn, memberSymbolOf } from '../rule-support.mjs';
import { rootedNodes, terminalCall } from './chain-support.mjs';

const MATCHERS = new Set(['requestMatchers', 'antMatchers', 'mvcMatchers', 'pathMatchers']);
const EVERYTHING = new Set(['/**', '/*', '**']);
const ANY_REQUEST = new Set(['anyRequest', 'anyExchange']);
const SCOPING = new Set(['securityMatcher', 'securityMatchers']);

function matchesEverything(file, argument) {
  const text = plainText(file.source, argument);
  return text !== undefined && EVERYTHING.has(text);
}

function everythingMatcher(file, matcher) {
  return (
    matcher !== undefined &&
    MATCHERS.has(matcher.name) &&
    matcher.arguments.some((argument) => matchesEverything(file, argument)) &&
    !matcher.arguments.some((argument) => textOf(file.source, argument).includes('HttpMethod'))
  );
}

function permitsEverything(file, call) {
  if (call.name !== 'permitAll' || call.receiver === undefined) {
    return false;
  }
  const before = terminalCall(file.source, call.receiver);
  return before !== undefined && (ANY_REQUEST.has(before.name) || everythingMatcher(file, before));
}

function ignoresEverything(file, call) {
  const before = terminalCall(file.source, call.receiver);
  return (
    before?.name === 'ignoring' && everythingMatcher(file, terminalCall(file.source, call.node))
  );
}

function dslPermitsEverything(file, call) {
  if (call.name !== 'authorize' || call.arguments.length !== 2) {
    return false;
  }
  const [target, access] = call.arguments.map((argument) => textOf(file.source, argument));
  return (
    access === 'permitAll' && (target === 'anyRequest' || /^"(?:\/\*\*|\/\*|\*\*)"$/.test(target))
  );
}

const permitAll = defineRule(
  'SpringPermitAllAnyRequest',
  'Name the public paths in requestMatchers(...).permitAll(), or pathMatchers(...).permitAll() on WebFlux, and end with anyRequest().authenticated(), or anyExchange().authenticated(), so a new endpoint is protected by default.',
  (file) =>
    file.functions
      .filter((declaration) => declaration.body !== undefined)
      .flatMap((declaration) => {
        const nodes = rootedNodes(file, declaration);
        const scoped = new Set(
          callsIn(file.source, declaration.body)
            .filter((call) => SCOPING.has(call.name))
            .map((call) => nodes.find(({ node }) => node === call.node)?.root),
        );
        return callsIn(file.source, declaration.body)
          .filter((call) => !call.reference)
          .filter(
            (call) =>
              ignoresEverything(file, call) ||
              ((permitsEverything(file, call) || dslPermitsEverything(file, call)) &&
                !scoped.has(nodes.find(({ node }) => node === call.node)?.root)),
          )
          .map((call) => hitOn(chainOf(call).start, `${memberSymbolOf(declaration)}@${call.name}`));
      }),
);

export const PERMIT_ALL_RULES = [permitAll];
