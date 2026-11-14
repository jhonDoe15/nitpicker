import { indentOf } from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { descendants, field, roleOf } from '../syntax.mjs';

const FORBIDDEN = new Set([
  'method_invocation',
  'object_creation_expression',
  'throw_statement',
  'lambda_expression',
  'method_reference',
  'explicit_constructor_invocation',
  'class_body',
]);
const THROWABLE = new Set([
  'getMessage',
  'getLocalizedMessage',
  'getCause',
  'toString',
  'getStackTrace',
  'printStackTrace',
  'getSuppressed',
]);
const UNSUPPORTED =
  'a catch clause of a differing exception type needs a try that is only a constructor call';
const EXCEPTION_USE =
  'the catch body uses the exception where its type cannot be shared: only a call of a Throwable method or an argument of a new object';

export function siteOf(node) {
  const clause = node.parent.parent.parent;
  const tryNode = clause.parent;
  return {
    clause,
    tryNode,
    formal: node.parent.parent,
    name: field(node.parent.parent, 'name').text,
    handler: field(clause, 'body'),
    body: field(tryNode, 'body'),
  };
}

function isLastCatch({ clause, tryNode }) {
  return tryNode.children.filter(({ type }) => type === 'catch_clause').at(-1).id === clause.id;
}

function isAllowedUse(node) {
  const { parent } = node;
  const receiver = parent.type === 'method_invocation' && field(parent, 'object')?.id === node.id;
  if (receiver) {
    return THROWABLE.has(field(parent, 'name').text);
  }
  return parent.type === 'argument_list' && parent.parent.type === 'object_creation_expression';
}

function bodyProblem({ body }, creationIds) {
  const unsafe = descendants(body).some(
    (node) =>
      FORBIDDEN.has(node.type) &&
      !(node.type === 'object_creation_expression' && creationIds.has(field(node, 'type').id)),
  );
  return unsafe ? UNSUPPORTED : undefined;
}

function handlerProblem({ handler, name }) {
  const uses = descendants(handler).filter(
    (node) => node.type === 'identifier' && node.text === name && roleOf(node) === 'reference',
  );
  return uses.every(isAllowedUse) ? undefined : EXCEPTION_USE;
}

export function catchProblem(sites, creationIds) {
  if (sites.tryNode?.type !== 'try_statement') {
    return UNSUPPORTED;
  }
  return isLastCatch(sites)
    ? (bodyProblem(sites, creationIds) ?? handlerProblem(sites))
    : UNSUPPORTED;
}

export function catchText(site, { names, unit, text }, render) {
  const { formal, handler, clause, name } = site;
  const first = handler.namedChildren[0];
  const indent =
    first === undefined
      ? `${indentOf(text, clause.startIndex)}${unit}`
      : indentOf(text, first.startIndex);
  const modifiers = formal.children.find(({ type }) => type === 'modifiers')?.text ?? '';
  const declared = `${modifiers === '' ? '' : `${modifiers} `}${names.type} ${name}`;
  return `catch (Exception ${names.caught}) {
${indent}if (!${names.failure}.isInstance(${names.caught})) {
${indent}${unit}throw (RuntimeException) ${names.caught};
${indent}}
${indent}${declared} = ${names.failure}.cast(${names.caught});${render(handler).slice(1, -1)}}`;
}
