import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { chainOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { enclosingFunction, insideAccessor } from '../../syntax/expressions/kotlin-scope.mjs';
import { textOf } from '../../syntax/kotlin-tree.mjs';
import { BEAN } from '../../names/spring-annotations.mjs';
import {
  JDK_HTTP_CLIENT,
  NETTY_HTTP_CLIENT,
  REACTOR_CONNECTOR,
  REQUEST_FACTORIES,
  REST_CLIENT,
  REST_TEMPLATE,
  REST_TEMPLATE_BUILDER,
  WEB_CLIENT,
} from '../../names/spring-clients.mjs';
import { hasAnnotation } from '../rule-support.mjs';
import {
  initializerNodes,
  propertyNodes,
  secondaryConstructorNodes,
  startupFunctions,
} from '../startup/startup-regions.mjs';

const CONSTRUCTED = [
  ['template', REST_TEMPLATE],
  ['template-builder', REST_TEMPLATE_BUILDER],
  ['factory', REQUEST_FACTORIES],
  ['connector', REACTOR_CONNECTOR],
];
const STATIC = [
  { kind: 'create', types: [REST_CLIENT, WEB_CLIENT], methods: ['create'] },
  {
    kind: 'builder',
    types: [REST_CLIENT, WEB_CLIENT, JDK_HTTP_CLIENT],
    methods: ['builder', 'newBuilder'],
  },
  { kind: 'jdk-new', types: [JDK_HTTP_CLIENT], methods: ['newHttpClient'] },
  { kind: 'netty', types: [NETTY_HTTP_CLIENT], methods: ['create', 'newConnection'] },
];

function writtenName(file, call) {
  const prefix = textOf(file.source, call.receiver);
  return prefix === '' ? call.name : `${prefix}.${call.name}`;
}

function kindOf(file, call) {
  const constructed = CONSTRUCTED.find(([, names]) =>
    file.resolver.matches(writtenName(file, call), names),
  );
  if (constructed !== undefined) {
    return constructed[0];
  }
  const receiver = textOf(file.source, call.receiver);
  return STATIC.find(
    ({ types, methods }) =>
      receiver !== '' &&
      methods.includes(call.name) &&
      types.some((names) => file.resolver.matches(receiver, names)),
  )?.kind;
}

export function clientSites(file) {
  return callsIn(file.source, file.tree)
    .filter((call) => !call.reference)
    .flatMap((call) => {
      const kind = kindOf(file, call);
      return kind === undefined ? [] : [{ call, kind, chain: chainOf(call) }];
    });
}

function setupFunctionsOf(file, owner) {
  return startupFunctions(file, owner, {
    functions: owner.functions.filter((member) => hasAnnotation(file, member, BEAN)),
    nodes: [
      ...initializerNodes(owner),
      ...secondaryConstructorNodes(owner),
      ...propertyNodes(owner),
    ],
  });
}

function returnsFromFactory(declaration, ancestors) {
  const staticOwner = declaration.owner === undefined || declaration.owner.kind === 'object';
  return (
    staticOwner &&
    (declaration.body?.t !== 'BLOCK' || ancestors.some((node) => node.t === 'RETURN'))
  );
}

export function inSetup(file, { call }) {
  if (insideAccessor(call.ancestors)) {
    return false;
  }
  const declaration = enclosingFunction(file, call.ancestors);
  if (declaration === undefined) {
    return true;
  }
  return (
    (declaration.owner !== undefined &&
      setupFunctionsOf(file, declaration.owner).has(declaration)) ||
    returnsFromFactory(declaration, call.ancestors)
  );
}
