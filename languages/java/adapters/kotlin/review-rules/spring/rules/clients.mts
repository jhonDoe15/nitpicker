import { annotationIn } from '../spring-names.mts';
import { entriesOf, setupScopes, startupScopes, symbolOf } from '../spring-scopes.mts';
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
} from '../spring-types.mts';
import type {
  Fqns,
  InvocationFact,
  Reported,
  ScopeFact,
  SpringView,
} from '../typed/spring-shapes.mts';

type FactoryCall = [Fqns, string[]];
export type CallShape = {
  name: string;
  receiver?: string | undefined;
  assign?: true;
  index?: true;
};

const CONNECT_TIMEOUT = 'connectTimeout';
const REQUEST_FACTORY = 'requestFactory';
const SCOPE_FUNCTIONS = new Set<string | undefined>(['apply', 'also', 'let', 'run', 'with']);
const FACTORY_SETTERS = new Set([
  'setConnectTimeout',
  'setReadTimeout',
  'setConnectionRequestTimeout',
  CONNECT_TIMEOUT,
  'readTimeout',
  'connectionRequestTimeout',
]);
const TEMPLATE_SETTERS = new Set(['setRequestFactory', REQUEST_FACTORY]);
const BUILDER_TIMEOUTS = new Set([REQUEST_FACTORY, 'clientConnector', CONNECT_TIMEOUT]);
const TEMPLATE_BUILDER_TIMEOUTS = new Set([
  CONNECT_TIMEOUT,
  'readTimeout',
  'setConnectTimeout',
  'setReadTimeout',
  REQUEST_FACTORY,
  'requestFactorySettings',
  'requestFactoryBuilder',
]);
const STATIC_OWNERS = new Set<string | undefined>(['object', 'companion']);
const CREATE = 'create';
const SPRING_FACTORY_CALLS: FactoryCall = [SPRING_CLIENT_FACTORIES, [CREATE, 'builder']];
const JDK_FACTORY_CALLS: FactoryCall = [JDK_HTTP_CLIENT, ['newHttpClient', 'newBuilder']];
const SPRING_CREATE: FactoryCall = [SPRING_CLIENT_FACTORIES, [CREATE]];
const SPRING_BUILDER: FactoryCall = [SPRING_CLIENT_FACTORIES, ['builder']];
const JDK_CREATE: FactoryCall = [JDK_HTTP_CLIENT, ['newHttpClient']];
const JDK_BUILDER: FactoryCall = [JDK_HTTP_CLIENT, ['newBuilder']];
const REACTOR_CREATE: FactoryCall = [REACTOR_HTTP_CLIENT, [CREATE, 'newConnection']];
const REACTOR_TIMEOUTS = new Set(['responseTimeout']);
const THIS = /^this\./u;
const TEMPLATE_NAME = /template/iu;
const PACKAGE = /^[a-z_]\w*(?:\.[a-z_]\w*)*$/u;

export function constructorName(invocation: CallShape): string | undefined {
  if (invocation.assign === true || invocation.index === true) {
    return undefined;
  }
  if (invocation.receiver === undefined) {
    return invocation.name;
  }
  return PACKAGE.test(invocation.receiver)
    ? `${invocation.receiver}.${invocation.name}`
    : undefined;
}

function constructs(view: SpringView, invocation: InvocationFact, fqns: Fqns): boolean {
  const name = constructorName(invocation);
  return name !== undefined && view.is(name, fqns);
}

function factory(
  view: SpringView,
  invocation: InvocationFact,
  [fqns, names]: FactoryCall,
): boolean {
  return (
    invocation.receiver !== undefined &&
    names.includes(invocation.name) &&
    view.is(invocation.receiver, fqns)
  );
}

function perCallClient(view: SpringView, invocation: InvocationFact): boolean {
  return (
    constructs(view, invocation, REST_TEMPLATE) ||
    constructs(view, invocation, REST_TEMPLATE_BUILDER) ||
    factory(view, invocation, SPRING_FACTORY_CALLS) ||
    factory(view, invocation, JDK_FACTORY_CALLS)
  );
}

function staticFactory(view: SpringView, invocation: InvocationFact): boolean {
  const fn = view.functionAt(invocation.scope);
  if (fn === undefined || invocation.returned !== true) {
    return false;
  }
  return fn.owner === '' || STATIC_OWNERS.has(view.classes.get(fn.owner)?.kind);
}

function sameName(invocation: InvocationFact, other: InvocationFact): boolean {
  return other.name === invocation.name && other.receiver === invocation.receiver;
}

function ownLambda(view: SpringView, invocation: InvocationFact, scope: ScopeFact): boolean {
  if (
    scope.k !== 'lambda' ||
    !SCOPE_FUNCTIONS.has(scope.host) ||
    scope.parent !== invocation.scope ||
    !(scope.qualifier ?? '').startsWith(`${invocation.name}(`) ||
    scope.line < invocation.line
  ) {
    return false;
  }
  const { line } = scope;
  const constructions = view.file.invocations.filter(
    (other) =>
      sameName(invocation, other) && other.scope === invocation.scope && other.line <= line,
  );
  return constructions.at(-1) === invocation;
}

function configured(view: SpringView, invocation: InvocationFact, setters: Set<string>): boolean {
  const target = invocation.assignedTo?.replace(THIS, '');
  const fn = view.functionAt(invocation.scope);
  return view.file.invocations.some(
    (other) =>
      setters.has(other.name) &&
      ((target !== undefined &&
        (other.receiver ?? '').replace(THIS, '') === target &&
        view.functionAt(other.scope) === fn) ||
        view.chain(other.scope).some((scope) => ownLambda(view, invocation, scope))),
  );
}

function after(invocation: InvocationFact, names: ReadonlySet<string | undefined>): boolean {
  return (invocation.after ?? []).some((name) => names.has(name));
}

function scoped(invocation: InvocationFact): boolean {
  return after(invocation, SCOPE_FUNCTIONS);
}

function wrapsTemplate(view: SpringView, invocation: InvocationFact): boolean {
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

function constructedWithoutTimeouts(view: SpringView, invocation: InvocationFact): boolean {
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

function factoryWithoutTimeouts(view: SpringView, invocation: InvocationFact): boolean {
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

function withoutTimeouts(view: SpringView, invocation: InvocationFact): boolean {
  return constructedWithoutTimeouts(view, invocation) || factoryWithoutTimeouts(view, invocation);
}

function httpClients(view: SpringView): Reported[] {
  const setup = setupScopes(
    view,
    (fn) => annotationIn(view.resolve, entriesOf(fn), BEAN) !== undefined,
  );
  return view.file.invocations.flatMap((invocation) => {
    const inSetup = setup(invocation.scope) || staticFactory(view, invocation);
    const rule = inSetup
      ? withoutTimeouts(view, invocation) && 'SpringHttpClientTimeouts'
      : perCallClient(view, invocation) && 'SpringHttpClientPerCall';
    return rule === false
      ? []
      : [
          {
            rule,
            line: invocation.line,
            symbol: symbolOf(view, invocation.scope, invocation.name),
          },
        ];
  });
}

const IO_TYPES = [ENTITY_MANAGER, JDBC, HTTP_CLIENTS];

function ioReceiver(view: SpringView, invocation: InvocationFact): boolean {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return (
    type !== undefined && (view.isRepository(type) || IO_TYPES.some((fqns) => view.is(type, fqns)))
  );
}

function postConstructIo(view: SpringView): Reported[] {
  const startup = startupScopes(view, { singletons: false });
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
