import { callsIn, isSelfCall } from '../../syntax/kotlin-calls.mjs';
import { statementOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { descendants, identifierOf, kids } from '../../syntax/kotlin-tree.mjs';
import { ENTITY_MANAGER } from '../../names/spring-types.mjs';
import { ITERABLES } from '../../names/spring-body-types.mjs';
import { arityRange, defineRule, hitOn, memberSymbolOf } from '../rule-support.mjs';
import {
  functionContexts,
  insideIteration,
  insideLoopWithoutClear,
  persistenceCalls,
  writeCallNames,
} from './persistence-calls.mjs';

const BATCH_CALLS = new Set([
  'saveAll',
  'saveAllAndFlush',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
]);
const SINGLE_ELEMENT = new Set([
  'listOf',
  'setOf',
  'mutableListOf',
  'mutableSetOf',
  'arrayListOf',
  'hashSetOf',
  'singletonList',
  'singleton',
  'of',
]);
const STANDARD = new Set([
  ...writeCallNames(),
  'saveAll',
  'saveAllAndFlush',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
  'deleteAllByIdInBatch',
  'flush',
]);
const READ_NAME = /^(?:find|get|read|count|exists|query|stream|search|load|fetch|list|is|has)/;
const WRITE_NAME =
  /^(?:update|delete|remove|mark|set|rename|insert|upsert|increment|decrement|reset|clear|purge|archive|touch)/;
const QUERY_FACTORIES = new Set(['createQuery', 'createNativeQuery', 'createNamedQuery']);
const QUERY_TYPES = new Set(['jakarta.persistence.Query', 'jakarta.persistence.TypedQuery']);
const LOOPS = new Set(['FOR', 'WHILE', 'DO_WHILE']);
const SINK_DEPTH = 3;

function inLoop(context, call) {
  return insideLoopWithoutClear(context, call) || insideIteration(context, call);
}

function singleElement(source, node) {
  if (node?.t === undefined) {
    return false;
  }
  const call = callsIn(source, node).find(
    (candidate) => candidate.node === node || candidate.ancestors.at(-1) === node,
  );
  return (
    call !== undefined &&
    SINGLE_ELEMENT.has(call.name) &&
    call.arguments.length === 1 &&
    !kids(call.arguments[0]).some((child) => child.t === 'MUL')
  );
}

function declaredSingle(context, call, name) {
  const scope = call.ancestors.findLast(
    (node) => LOOPS.has(node.t) || node.t === 'LAMBDA_EXPRESSION',
  );
  return (
    scope !== undefined &&
    descendants(
      scope,
      (node) => node.t === 'PROPERTY' && identifierOf(context.file.source, node) === name,
    ).some((property) => {
      const children = kids(property);
      return singleElement(
        context.file.source,
        children[children.findIndex((child) => child.t === 'EQ') + 1],
      );
    })
  );
}

function isBatchOfOne(context, call) {
  const argument = kids(call.arguments[0])[0];
  if (call.arguments.length !== 1 || argument === undefined) {
    return false;
  }
  const { source } = context.file;
  return (
    singleElement(source, argument) ||
    (argument.t === 'REFERENCE_EXPRESSION' &&
      declaredSingle(context, call, source.text.slice(argument.s, argument.e)))
  );
}

const batchOfOne = defineRule(
  'SpringDataBatchOfOne',
  'Collect the entities of the whole loop and call saveAll or deleteAll once. Calling it with a one-element list on each iteration is still one write per entity.',
  (file, project) =>
    functionContexts(file).flatMap((context) =>
      persistenceCalls({ context, targets: project.repositoryTypes, names: BATCH_CALLS })
        .filter((call) => !call.reference && isBatchOfOne(context, call) && inLoop(context, call))
        .map((call) => hitOn(call.node, `${memberSymbolOf(context.scope.fn)}@${call.name}`)),
    ),
);

function takesIterable(context, call) {
  return call.arguments.some((argument) =>
    receiverMatches(context, { receiver: kids(argument)[0] }, ITERABLES),
  );
}

function isRowWrite(context, call) {
  const name = call.name;
  if (STANDARD.has(name) || READ_NAME.test(name) || takesIterable(context, call)) {
    return false;
  }
  return call.reference || statementOf(call) || WRITE_NAME.test(name);
}

function isUpdateQuery(context, call) {
  if (call.name !== 'executeUpdate' || call.reference || call.receiver === undefined) {
    return false;
  }
  return (
    receiverMatches(context, call, QUERY_TYPES) ||
    callsIn(context.file.source, call.receiver).some((inner) => QUERY_FACTORIES.has(inner.name))
  );
}

function sinkReference(call) {
  const nearest = call.ancestors.slice(-SINK_DEPTH);
  return call.reference && nearest.some((node) => node.t === 'CALL_EXPRESSION');
}

const rowWrite = defineRule(
  'SpringDataRowWriteInLoop',
  'Write one set-based @Query that takes the whole list, for example where id in :ids, and call it once after the loop instead of one repository update or delete per iteration.',
  (file, project) =>
    functionContexts(file).flatMap((context) => {
      const repositories = persistenceCalls({
        context,
        targets: project.repositoryTypes,
        names: () => true,
      }).filter((call) => isRowWrite(context, call));
      const updates = callsIn(file.source, context.body).filter((call) =>
        isUpdateQuery(context, call),
      );
      return [...repositories, ...updates]
        .filter((call) => (call.reference ? sinkReference(call) : inLoop(context, call)))
        .map((call) => hitOn(call.node, `${memberSymbolOf(context.scope.fn)}@${call.name}`));
    }),
);

function arityFits(member, call) {
  const [least, most] = arityRange(member);
  return call.arguments.length >= least && call.arguments.length <= most;
}

function writesEntity(file, { owner, member }, project) {
  const context = { file, scope: { owner, fn: member }, body: member.body };
  const targets = new Set([...project.repositoryTypes, ...ENTITY_MANAGER]);
  return persistenceCalls({ context, targets, names: writeCallNames() }).length > 0;
}

const saveHelper = defineRule(
  'SpringDataSaveInLoopHelper',
  'Collect the entities and call saveAll or deleteAll once after the loop; when rows must fail one by one, call saveAll per batch and handle the error per batch. This loop calls a function of this class that saves or deletes one entity, so it still writes once per iteration.',
  (file, project) =>
    functionContexts(file).flatMap((context) =>
      callsIn(file.source, context.body)
        .filter((call) => isSelfCall(call) && context.scope.owner !== undefined)
        .filter((call) =>
          context.scope.owner.functions.some(
            (member) =>
              member.name === call.name &&
              member.body !== undefined &&
              (call.reference || arityFits(member, call)) &&
              writesEntity(file, { owner: context.scope.owner, member }, project),
          ),
        )
        .filter((call) => (call.reference ? insideIteration(context, call) : inLoop(context, call)))
        .map((call) => hitOn(call.node, `${memberSymbolOf(context.scope.fn)}@${call.name}`)),
    ),
);

export const LOOP_WRITE_RULES = [batchOfOne, rowWrite, saveHelper];
