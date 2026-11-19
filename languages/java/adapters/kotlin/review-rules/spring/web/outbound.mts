import { symbolOf } from '../spring-scopes.mts';
import {
  HTTP_REQUEST,
  REST_OPERATIONS,
  SPRING_CLIENT_BUILDERS,
  SPRING_CLIENT_FACTORIES,
} from '../spring-types.mts';
import { requestFlow } from './requests/flow.mts';
import { judged, typed } from './requests/sinks.mts';
import { REDIRECT_RULE } from './redirects.mts';
import type { Argument, InvocationFact, Reported, SpringView } from '../typed/spring-shapes.mts';

const TEMPLATE_CALLS = new Set([
  'getForObject',
  'getForEntity',
  'headForHeaders',
  'postForLocation',
  'postForObject',
  'postForEntity',
  'put',
  'patchForObject',
  'delete',
  'optionsForAllow',
  'exchange',
  'execute',
]);
const BASE_URL_CALLS = new Set(['baseUrl', 'rootUri']);
const URI_BUILDER_CALLS = new Set(['host', 'port', 'scheme', 'uri', 'userInfo']);
const CLIENT_CALLS = new Set([
  ...TEMPLATE_CALLS,
  ...BASE_URL_CALLS,
  ...URI_BUILDER_CALLS,
  'create',
  'newBuilder',
]);

function inUriLambda(view: SpringView, invocation: InvocationFact): boolean {
  const [scope] = view.chain(invocation.scope);
  return scope?.k === 'lambda' && scope.host === 'uri';
}

function isUrlSink(view: SpringView, invocation: InvocationFact): boolean {
  const { name, receiver } = invocation;
  return (
    (TEMPLATE_CALLS.has(name) && typed(view, invocation, REST_OPERATIONS)) ||
    (name === 'uri' &&
      typed(view, invocation, new Set([...SPRING_CLIENT_FACTORIES, ...HTTP_REQUEST]))) ||
    (name === 'create' && view.is(receiver, SPRING_CLIENT_FACTORIES)) ||
    (name === 'newBuilder' && view.is(receiver, HTTP_REQUEST)) ||
    (BASE_URL_CALLS.has(name) &&
      typed(view, invocation, new Set([...SPRING_CLIENT_FACTORIES, ...SPRING_CLIENT_BUILDERS]))) ||
    (URI_BUILDER_CALLS.has(name) && inUriLambda(view, invocation))
  );
}

function urlArgument(view: SpringView, invocation: InvocationFact): Argument | undefined {
  const [first] = invocation.arguments;
  return first === undefined || first.lambda || !isUrlSink(view, invocation) ? undefined : first;
}

function outboundUrls(view: SpringView): Reported[] {
  const sinks = view.file.invocations
    .filter(({ name }) => CLIENT_CALLS.has(name))
    .flatMap((invocation) => {
      const reads = urlArgument(view, invocation)?.reads;
      return reads !== undefined && judged(view, invocation.scope) ? [{ invocation, reads }] : [];
    });
  if (sinks.length === 0) {
    return [];
  }
  const flow = requestFlow(view);
  return sinks
    .filter(({ invocation, reads }) =>
      flow.tainted(reads, invocation.scope, { line: invocation.line }),
    )
    .map(({ invocation }) => ({
      rule: 'SpringOutboundUrl',
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

export const OUTBOUND_RULES = [outboundUrls, REDIRECT_RULE];
