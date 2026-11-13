import { annotationIn, argumentOf } from '../spring-names.mjs';
import { entriesOf } from '../spring-scopes.mjs';
import { SPRING_TRANSACTIONAL } from '../spring-types.mjs';

const QUALIFIED_NAME = /^[\w.]*$/u;
const NAME = /^\w+$/u;
const FREE_ATTRIBUTES = new Set(['readOnly', 'label']);
const JOINING = new Set(['REQUIRED', 'SUPPORTS', 'MANDATORY']);
const RUNNING = new Set(['REQUIRED', 'REQUIRES_NEW', 'MANDATORY', 'NESTED']);
const MATCHED_ATTRIBUTES = new Set([
  'rollbackFor',
  'rollbackForClassName',
  'noRollbackFor',
  'noRollbackForClassName',
  'timeout',
  'timeoutString',
  'isolation',
  'value',
  'transactionManager',
]);

function lastName(text) {
  const name = text.split('.').at(-1);
  return QUALIFIED_NAME.test(text) && NAME.test(name) ? name : undefined;
}

function propagationOf(annotation) {
  const text = argumentOf(annotation, 'propagation');
  return text === undefined ? undefined : lastName(text.trim());
}

function runs(annotation) {
  const propagation = propagationOf(annotation);
  return propagation === undefined || RUNNING.has(propagation);
}

function attributeText(annotation, name) {
  return annotation.arguments.find((argument) => (argument.name ?? 'value') === name)?.text.trim();
}

export function runningTransactions(view, caller) {
  if (caller === undefined) {
    return [];
  }
  const owner = view.classes.get(caller.owner);
  const declared = annotationIn(view.resolve, entriesOf(caller), SPRING_TRANSACTIONAL);
  const inherited =
    declared !== undefined || caller.visibility === 'private' || owner === undefined
      ? undefined
      : annotationIn(view.resolve, owner.annotations, SPRING_TRANSACTIONAL);
  return [declared, inherited].filter((annotation) => annotation !== undefined && runs(annotation));
}

export function joinsTransaction(view, annotation, running) {
  return (
    running.length > 0 &&
    annotationIn(view.resolve, [annotation], SPRING_TRANSACTIONAL) !== undefined &&
    annotation.arguments.every((argument) => {
      const name = argument.name ?? 'value';
      if (FREE_ATTRIBUTES.has(name)) {
        return true;
      }
      if (name === 'propagation') {
        return JOINING.has(propagationOf(annotation));
      }
      return (
        MATCHED_ATTRIBUTES.has(name) &&
        running.some((caller) => attributeText(caller, name) === argument.text.trim())
      );
    })
  );
}
