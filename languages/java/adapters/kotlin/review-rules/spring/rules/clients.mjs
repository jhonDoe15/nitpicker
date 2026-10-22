import { annotationIn } from '../spring-names.mjs';
import { entriesOf, setupScopes, startupScopes, symbolOf } from '../spring-scopes.mjs';
import {
  BEAN,
  ENTITY_MANAGER,
  HTTP_CLIENTS,
  JDBC,
  JDK_HTTP_CLIENT,
  REACTOR_CONNECTOR,
  REACTOR_HTTP_CLIENT,
  REQUEST_FACTORIES,
  REST_TEMPLATE,
  REST_TEMPLATE_BUILDER,
  SPRING_CLIENT_FACTORIES,
} from '../spring-types.mjs';

const SCOPE_FUNCTIONS = new Set(['apply', 'also', 'let', 'run', 'with']);
const FACTORY_SETTERS = new Set([
  'setConnectTimeout',
  'setReadTimeout',
  'setConnectionRequestTimeout',
  'connectTimeout',
  'readTimeout',
  'connectionRequestTimeout',
]);
const TEMPLATE_SETTERS = new Set(['setRequestFactory', 'requestFactory']);
const BUILDER_TIMEOUTS = new Set(['requestFactory', 'clientConnector', 'connectTimeout']);
const TEMPLATE_BUILDER_TIMEOUTS = new Set([
  'connectTimeout',
  'readTimeout',
  'setConnectTimeout',
  'setReadTimeout',
  'requestFactory',
  'requestFactorySettings',
  'requestFactoryBuilder',
]);
const STATIC_OWNERS = new Set(['object', 'companion']);
const SPRING_FACTORY_CALLS = [SPRING_CLIENT_FACTORIES, ['create', 'builder']];
const JDK_FACTORY_CALLS = [JDK_HTTP_CLIENT, ['newHttpClient', 'newBuilder']];
const SPRING_CREATE = [SPRING_CLIENT_FACTORIES, ['create']];
const SPRING_BUILDER = [SPRING_CLIENT_FACTORIES, ['builder']];
const JDK_CREATE = [JDK_HTTP_CLIENT, ['newHttpClient']];
const JDK_BUILDER = [JDK_HTTP_CLIENT, ['newBuilder']];
const REACTOR_CREATE = [REACTOR_HTTP_CLIENT, ['create', 'newConnection']];
const REACTOR_TIMEOUTS = new Set(['responseTimeout']);
const THIS = /^this\./u;
const TEMPLATE_NAME = /template/iu;

function constructs(view, invocation, fqns) {
  return (
    invocation.receiver === undefined &&
    invocation.assign !== true &&
    view.is(invocation.name, fqns)
  );
}

function factory(view, invocation, [fqns, names]) {
  return (
    invocation.receiver !== undefined &&
    names.includes(invocation.name) &&
    view.is(invocation.receiver, fqns)
  );
}

function perCallClient(view, invocation) {
  return (
    constructs(view, invocation, REST_TEMPLATE) ||
    constructs(view, invocation, REST_TEMPLATE_BUILDER) ||
    factory(view, invocation, SPRING_FACTORY_CALLS) ||
    factory(view, invocation, JDK_FACTORY_CALLS)
  );
}

function staticFactory(view, invocation) {
  const fn = view.functionAt(invocation.scope);
  if (fn === undefined || invocation.returned !== true) {
    return false;
  }
  return fn.owner === '' || STATIC_OWNERS.has(view.classes.get(fn.owner)?.kind);
}

function configured(view, invocation, setters) {
  const target = invocation.assignedTo?.replace(THIS, '');
  return view.file.invocations.some(
    (other) =>
      setters.has(other.name) &&
      ((target !== undefined && (other.receiver ?? '').replace(THIS, '') === target) ||
        view
          .chain(other.scope)
          .some(
            ({ k, host, qualifier }) =>
              k === 'lambda' &&
              SCOPE_FUNCTIONS.has(host) &&
              (qualifier ?? '').startsWith(`${invocation.name}(`),
          )),
  );
}

function after(invocation, names) {
  return (invocation.after ?? []).some((name) => names.has(name));
}

function scoped(invocation) {
  return after(invocation, SCOPE_FUNCTIONS);
}

function wrapsTemplate(view, invocation) {
  const [first] = invocation.arguments;
  if (first === undefined) {
    return false;
  }
  if (first.text.startsWith('RestTemplate(')) {
    return true;
  }
  const type = view.typeOf(invocation.scope, first.text);
  return type === undefined ? TEMPLATE_NAME.test(first.text) : view.is(type, REST_TEMPLATE);
}

function constructedWithoutTimeouts(view, invocation) {
  const bare = invocation.arguments.length === 0;
  if (constructs(view, invocation, REST_TEMPLATE)) {
    return bare && !configured(view, invocation, TEMPLATE_SETTERS);
  }
  if (constructs(view, invocation, REQUEST_FACTORIES)) {
    return bare && !configured(view, invocation, FACTORY_SETTERS);
  }
  if (constructs(view, invocation, REST_TEMPLATE_BUILDER)) {
    return bare && !scoped(invocation) && !after(invocation, TEMPLATE_BUILDER_TIMEOUTS);
  }
  return bare && constructs(view, invocation, REACTOR_CONNECTOR);
}

function factoryWithoutTimeouts(view, invocation) {
  if (factory(view, invocation, SPRING_CREATE)) {
    return !wrapsTemplate(view, invocation);
  }
  if (factory(view, invocation, JDK_CREATE)) {
    return true;
  }
  if (factory(view, invocation, SPRING_BUILDER) || factory(view, invocation, JDK_BUILDER)) {
    return (
      invocation.arguments.length === 0 &&
      !scoped(invocation) &&
      !after(invocation, BUILDER_TIMEOUTS)
    );
  }
  return (
    factory(view, invocation, REACTOR_CREATE) &&
    !scoped(invocation) &&
    !after(invocation, REACTOR_TIMEOUTS) &&
    !configured(view, invocation, REACTOR_TIMEOUTS)
  );
}

function withoutTimeouts(view, invocation) {
  return invocation.receiver === undefined
    ? constructedWithoutTimeouts(view, invocation)
    : factoryWithoutTimeouts(view, invocation);
}

function httpClients(view) {
  const setup = setupScopes(
    view,
    (fn) => annotationIn(view.resolve, entriesOf(fn), BEAN) !== undefined,
  );
  return view.file.invocations.flatMap((invocation) => {
    const inSetup = setup(invocation.scope) || staticFactory(view, invocation);
    const rule = inSetup
      ? withoutTimeouts(view, invocation) && 'SpringHttpClientTimeouts'
      : perCallClient(view, invocation) && 'SpringHttpClientPerCall';
    return rule
      ? [{ rule, line: invocation.line, symbol: symbolOf(view, invocation.scope, invocation.name) }]
      : [];
  });
}

const IO_TYPES = [ENTITY_MANAGER, JDBC, HTTP_CLIENTS];

function ioReceiver(view, invocation) {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return (
    type !== undefined && (view.isRepository(type) || IO_TYPES.some((fqns) => view.is(type, fqns)))
  );
}

function postConstructIo(view) {
  const startup = startupScopes(view);
  return view.file.invocations
    .filter(
      (invocation) => view.functionAt(invocation.scope) !== undefined && startup(invocation.scope),
    )
    .filter((invocation) => ioReceiver(view, invocation))
    .map((invocation) => ({
      rule: 'SpringNoPostConstructIo',
      line: invocation.line,
      symbol: symbolOf(view, invocation.scope, invocation.name),
    }));
}

export const CLIENT_RULES = [httpClients, postConstructIo];
