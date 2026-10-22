import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { FOREIGN_TRANSACTIONAL, THROWS, TRANSACTIONAL } from '../../names/spring-annotations.mjs';
import { ENTITY_MANAGER } from '../../names/spring-types.mjs';
import {
  annotationOn,
  defineRule,
  hasAnnotation,
  hitOn,
  isTrueArgument,
  memberSymbolOf,
} from '../rule-support.mjs';

const NON_PUBLIC = ['private', 'protected', 'internal'];
const ENTITY_WRITES = new Set([
  'save',
  'saveAll',
  'saveAndFlush',
  'saveAllAndFlush',
  'delete',
  'deleteAll',
  'deleteById',
  'deleteAllById',
  'deleteAllInBatch',
  'persist',
  'merge',
  'remove',
]);
const REPOSITORY_WRITE_NAME =
  /^(?:update|delete|remove|mark|set|rename|insert|upsert|increment|decrement|reset|clear|purge|archive|touch)/;
const CLASS_LITERAL = /([\w.]+)::class/g;

function lacksRollback(annotation) {
  return (
    !annotation.args.some(({ name }) => ['rollbackFor', 'rollbackForClassName'].includes(name)) &&
    !isTrueArgument(annotation, 'readOnly')
  );
}

function checkedThrows(file, declaration, project) {
  return declaration.annotations
    .filter((annotation) => file.resolver.matches(annotation.name, THROWS))
    .filter((annotation) =>
      [
        ...annotation.args
          .map(({ text }) => text)
          .join(' ')
          .matchAll(CLASS_LITERAL),
      ].some(([, name]) => file.resolver.matches(name, project.checkedExceptions)),
    );
}

function rollbackGap(file, declaration) {
  const own = annotationOn(file, declaration, TRANSACTIONAL);
  if (own !== undefined) {
    return lacksRollback(own);
  }
  const owner = declaration.owner;
  const inherited = owner === undefined ? undefined : annotationOn(file, owner, TRANSACTIONAL);
  return (
    inherited !== undefined &&
    !NON_PUBLIC.some((modifier) => declaration.modifiers.has(modifier)) &&
    lacksRollback(inherited)
  );
}

const checkedRollback = defineRule(
  'SpringTransactionalCheckedRollback',
  'Add rollbackFor = [Exception::class] to this @Transactional, or throw an unchecked exception. Kotlin does not check exceptions, but a checked one (declared with @Throws) still commits the work done so far instead of rolling it back.',
  (file, project) =>
    file.functions
      .filter((declaration) => rollbackGap(file, declaration))
      .flatMap((declaration) =>
        checkedThrows(file, declaration, project).map((annotation) =>
          hitOn(annotation.node, `${memberSymbolOf(declaration)}@Throws`),
        ),
      ),
);

function readOnlyScope(file, declaration) {
  const own = annotationOn(file, declaration, TRANSACTIONAL);
  if (own !== undefined) {
    return isTrueArgument(own, 'readOnly');
  }
  const owner = declaration.owner;
  const foreign = hasAnnotation(file, declaration, FOREIGN_TRANSACTIONAL);
  const inherited = owner === undefined ? undefined : annotationOn(file, owner, TRANSACTIONAL);
  return !foreign && inherited !== undefined && isTrueArgument(inherited, 'readOnly');
}

function writesIn(file, declaration, project) {
  const context = { file, scope: { owner: declaration.owner, fn: declaration } };
  const entityTargets = new Set([...project.repositoryTypes, ...ENTITY_MANAGER]);
  return callsIn(file.source, declaration.body).filter(
    (call) =>
      (ENTITY_WRITES.has(call.name) && receiverMatches(context, call, entityTargets)) ||
      (REPOSITORY_WRITE_NAME.test(call.name) &&
        receiverMatches(context, call, project.repositoryTypes)),
  );
}

const readOnlyWrite = defineRule(
  'SpringTransactionalReadOnlyWrite',
  'Put @Transactional without readOnly on this function: a write inside a read-only transaction is skipped or fails.',
  (file, project) =>
    file.functions
      .filter((declaration) => declaration.body !== undefined && readOnlyScope(file, declaration))
      .flatMap((declaration) =>
        writesIn(file, declaration, project).map((call) =>
          hitOn(call.node, `${memberSymbolOf(declaration)}@${call.name}`),
        ),
      ),
);

export const TRANSACTION_RULES = [checkedRollback, readOnlyWrite];
