import { argumentValue } from '../../syntax/kotlin-annotations.mjs';
import { callsIn, receiverName, walk } from '../../syntax/kotlin-calls.mjs';
import { assignedName, operatorOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { kids, textOf } from '../../syntax/kotlin-tree.mjs';
import {
  BEAN,
  BEAN_INITIALIZERS,
  POST_CONSTRUCT,
  SCOPES,
  SHORT_LIVED_SCOPES,
  STEREOTYPES,
  SYNCHRONIZED,
} from '../../names/spring-annotations.mjs';
import { LOCKS } from '../../names/spring-clients.mjs';
import { classSymbolOf, defineRule, annotationOn, hasAnnotation, hitOn } from '../rule-support.mjs';
import {
  initializerNodes,
  secondaryConstructorNodes,
  startupFunctions,
} from './startup-regions.mjs';

const CREATORS = new Set([
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'ArrayList',
  'LinkedList',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'ArrayDeque',
  'mutableMapOf',
  'mutableListOf',
  'mutableSetOf',
  'hashMapOf',
  'linkedMapOf',
  'sortedMapOf',
  'arrayListOf',
  'hashSetOf',
  'linkedSetOf',
  'sortedSetOf',
]);
const MUTATORS = new Set([
  'add',
  'addAll',
  'put',
  'putAll',
  'remove',
  'removeIf',
  'removeAll',
  'retainAll',
  'clear',
  'putIfAbsent',
  'computeIfAbsent',
  'computeIfPresent',
  'compute',
  'merge',
  'replace',
  'replaceAll',
  'push',
  'pop',
  'poll',
  'offer',
  'addFirst',
  'addLast',
  'getOrPut',
  'removeAt',
  'removeFirst',
  'removeLast',
  'set',
]);
const COMPOUND = new Set(['+=', '-=']);
const LOCKING_CALLS = new Set(['lock', 'lockInterruptibly', 'tryLock']);
const GUARD_BLOCKS = new Set(['synchronized', 'withLock', 'read', 'write']);
const TOP_LEVEL = new Set([
  'CALL_EXPRESSION',
  'DOT_QUALIFIED_EXPRESSION',
  'SAFE_ACCESS_EXPRESSION',
]);

function initializerOf(property) {
  const children = kids(property.node);
  const equals = children.findIndex((child) => child.t === 'EQ');
  return equals < 0 ? undefined : children[equals + 1];
}

function createsCollection(file, property) {
  const expression = initializerOf(property);
  if (expression === undefined || !TOP_LEVEL.has(expression.t)) {
    return false;
  }
  const call = expression.t === 'CALL_EXPRESSION' ? expression : kids(expression).at(-1);
  return call?.t === 'CALL_EXPRESSION' && CREATORS.has(textOf(file.source, kids(call)[0]));
}

function isSingleton(file, declaration) {
  const scope = annotationOn(file, declaration, SCOPES);
  const explicit =
    scope !== undefined &&
    ['value', 'scopeName'].some((name) => argumentValue(scope, name)?.text === '"singleton"');
  return (
    hasAnnotation(file, declaration, STEREOTYPES) &&
    !hasAnnotation(file, declaration, SHORT_LIVED_SCOPES) &&
    (scope === undefined || explicit)
  );
}

function initMethodNames(file) {
  return file.classes
    .flatMap((declaration) => declaration.functions)
    .flatMap((member) => member.annotations)
    .filter((annotation) => file.resolver.matches(annotation.name, BEAN))
    .flatMap((annotation) => annotation.args)
    .filter((argument) => argument.name === 'initMethod')
    .map((argument) => argument.text.replaceAll('"', ''));
}

function startupOf(file, declaration) {
  const interfaces = declaration.supertypes.filter(({ type }) =>
    file.resolver.matches(type.name, BEAN_INITIALIZERS),
  );
  const named = new Set([
    ...(interfaces.length > 0 ? ['afterPropertiesSet', 'afterSingletonsInstantiated'] : []),
    ...initMethodNames(file),
  ]);
  return startupFunctions(file, declaration, {
    functions: declaration.functions.filter(
      (member) =>
        hasAnnotation(file, member, POST_CONSTRUCT) ||
        (named.has(member.name) && member.params.length === 0),
    ),
    nodes: [...initializerNodes(declaration), ...secondaryConstructorNodes(declaration)],
  });
}

function guardedBlock(file, ancestors) {
  return ancestors.some(
    (node) => node.t === 'CALL_EXPRESSION' && GUARD_BLOCKS.has(textOf(file.source, kids(node)[0])),
  );
}

function locksInside(file, declaration) {
  const context = { file, scope: { owner: declaration.owner, fn: declaration } };
  return callsIn(file.source, declaration.body).some(
    (call) =>
      call.name === 'withLock' ||
      (LOCKING_CALLS.has(call.name) && receiverMatches(context, call, LOCKS)),
  );
}

function indexedAssignment(source, node, name) {
  const [left] = kids(node);
  if (left?.t !== 'ARRAY_ACCESS_EXPRESSION' || operatorOf(source, node) !== '=') {
    return false;
  }
  return assignedName(source, kids(left)[0]).member === name;
}

function compoundAssignment(source, node, name) {
  return (
    COMPOUND.has(operatorOf(source, node)) &&
    kids(node)[0]?.t === 'REFERENCE_EXPRESSION' &&
    textOf(source, kids(node)[0]) === name
  );
}

function mutationsOf(file, declaration, name) {
  const source = file.source;
  const calls = callsIn(source, declaration.body)
    .filter((call) => !call.reference && MUTATORS.has(call.name))
    .filter((call) => receiverName(source, call.receiver) === name)
    .map((call) => call.ancestors);
  const assignments = walk(declaration.body)
    .filter(({ node }) => node.t === 'BINARY_EXPRESSION')
    .filter(
      ({ node }) => indexedAssignment(source, node, name) || compoundAssignment(source, node, name),
    )
    .map(({ ancestors }) => ancestors);
  return [...calls, ...assignments];
}

function isMutatedAfterStartup(file, declaration, property, startup) {
  return declaration.functions
    .filter((member) => member.body !== undefined && !startup.has(member))
    .filter((member) => !hasAnnotation(file, member, SYNCHRONIZED) && !locksInside(file, member))
    .some((member) =>
      mutationsOf(file, member, property.name).some((ancestors) => !guardedBlock(file, ancestors)),
    );
}

const collectionState = defineRule(
  'SpringBeanCollectionState',
  'Fill a plain collection of a shared singleton bean only at startup (init, the constructor, @PostConstruct or afterPropertiesSet) and keep it read-only, or use a ConcurrentHashMap or a cache (@Cacheable). Changed after startup, request threads would write to it at once.',
  (file) =>
    file.classes
      .filter((declaration) => declaration.kind === 'class' && isSingleton(file, declaration))
      .flatMap((declaration) => {
        const startup = startupOf(file, declaration);
        return declaration.properties
          .filter((property) => !property.mutable && createsCollection(file, property))
          .filter((property) => isMutatedAfterStartup(file, declaration, property, startup))
          .map((property) =>
            hitOn(property.node, `${classSymbolOf(declaration)}.${property.name}`),
          );
      }),
);

export const COLLECTION_STATE_RULES = [collectionState];
