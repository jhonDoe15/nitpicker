import { annotationIn } from '../spring-names.mjs';
import { entriesOf, symbolOf } from '../spring-scopes.mjs';
import {
  BEAN,
  CONFIGURATION_CLASSES,
  HTTP_REQUEST,
  REDIRECT_VIEW,
  REST_OPERATIONS,
  SPRING_CLIENT_BUILDERS,
  SPRING_CLIENT_FACTORIES,
  STEREOTYPES,
} from '../spring-types.mjs';
import { readsTainted, regionOf, requestTaint } from './request-values.mjs';

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
const ROOT = /^[\p{L}_][\p{L}\p{N}_]*/u;
const CONSTRUCTOR_REGIONS = new Set(['class', 'init']);
const PREFIX = String.raw`"(?:redirect|forward):(?:(?:https?:)?\/\/?)?`;
const TEMPLATED = new RegExp(String.raw`${PREFIX}\$(\{[^}]*\}|[\p{L}_][\p{L}\p{N}_]*)`, 'gu');
const JOINED = new RegExp(String.raw`${PREFIX}"\s*\+\s*([^,)]+)`, 'gu');

function annotations(declared) {
  return declared?.annotationEntries ?? declared?.annotations ?? [];
}

function typed(view, { scope, receiver }, fqns) {
  const root = ROOT.exec(receiver ?? '')?.[0];
  if (root === undefined) {
    return false;
  }
  const type = view.typeOf(scope, root);
  return view.is(root, fqns) || (type !== undefined && view.is(type, fqns));
}

function inUriLambda(view, invocation) {
  const [scope] = view.chain(invocation.scope);
  return scope?.k === 'lambda' && scope.host === 'uri';
}

function urlArgument(view, invocation) {
  const { name, receiver, arguments: [first] = [] } = invocation;
  if (first === undefined || first.lambda === true) {
    return undefined;
  }
  const sink =
    (TEMPLATE_CALLS.has(name) && typed(view, invocation, REST_OPERATIONS)) ||
    (name === 'uri' &&
      typed(view, invocation, new Set([...SPRING_CLIENT_FACTORIES, ...HTTP_REQUEST]))) ||
    (name === 'create' && view.is(receiver, SPRING_CLIENT_FACTORIES)) ||
    (name === 'newBuilder' && view.is(receiver, HTTP_REQUEST)) ||
    (BASE_URL_CALLS.has(name) &&
      typed(view, invocation, new Set([...SPRING_CLIENT_FACTORIES, ...SPRING_CLIENT_BUILDERS]))) ||
    (name === 'host' && inUriLambda(view, invocation));
  return sink ? first.text : undefined;
}

function judged(view, scope) {
  const region = regionOf(view, scope);
  const owner = view.classAt(scope);
  if (annotationIn(view.resolve, annotations(owner), CONFIGURATION_CLASSES) !== undefined) {
    return false;
  }
  if (region?.k === 'fun') {
    const fn = view.functionOf(region);
    const constructor = fn?.name === '<init>' || region.name === '<init>';
    return (
      annotationIn(view.resolve, entriesOf(fn ?? {}), BEAN) === undefined &&
      !(constructor && managed(view, owner))
    );
  }
  return !(CONSTRUCTOR_REGIONS.has(region?.k) && managed(view, owner));
}

function managed(view, owner) {
  return annotationIn(view.resolve, annotations(owner), STEREOTYPES) !== undefined;
}

function outboundUrls(view) {
  const taintAt = requestTaint(view, { members: true });
  return view.file.invocations
    .filter((invocation) => judged(view, invocation.scope))
    .filter((invocation) => readsTainted(urlArgument(view, invocation), taintAt(invocation.scope)))
    .map((invocation) => ({
      rule: 'SpringOutboundUrl',
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

function redirectsTo(text, taint) {
  return [...(text ?? '').matchAll(TEMPLATED), ...(text ?? '').matchAll(JOINED)].some(([, read]) =>
    readsTainted(read.startsWith('{') ? read.slice(1, -1) : read, taint),
  );
}

function redirectTexts(view) {
  return [
    ...(view.file.returnValues ?? []),
    ...view.file.locals.map(({ scope, line, value }) => ({ scope, line, text: value })),
    ...view.file.invocations.flatMap(({ scope, line, arguments: given }) =>
      given.map(({ text }) => ({ scope, line, text })),
    ),
  ];
}

function openRedirects(view) {
  const taintAt = requestTaint(view, { members: false });
  const texts = redirectTexts(view)
    .filter(({ scope, text }) => redirectsTo(text, taintAt(scope)))
    .map(({ scope, line }) => ({ line, symbol: symbolOf(view, scope) }));
  const views = view.file.invocations
    .filter(
      (invocation) => invocation.receiver === undefined && view.is(invocation.name, REDIRECT_VIEW),
    )
    .filter((invocation) => readsTainted(invocation.arguments[0]?.text, taintAt(invocation.scope)))
    .map((invocation) => ({
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
  const lines = new Set();
  return [...texts, ...views]
    .filter(({ line }) => !lines.has(line) && lines.add(line))
    .map((found) => ({ rule: 'SpringOpenRedirect', ...found }));
}

export const OUTBOUND_RULES = [outboundUrls, openRedirects];
