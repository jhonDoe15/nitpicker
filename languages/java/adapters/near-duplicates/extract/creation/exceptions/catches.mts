import type { Node } from 'web-tree-sitter';
import type {
  CatchNames,
  CatchSite,
  OccurrenceHole,
  TypeSources,
} from '../../../extract-types.mts';
import { indentOf } from '../../../jvm-views.mts';
import { descendants, field, parentOf, present, required, roleOf } from '../../syntax.mts';
import { importsOf, qualified } from '../arg-types.mts';
import { isSingleConstructor } from './constructors.mts';

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
const UNCHECKED = new Set([
  'java.lang.RuntimeException',
  'java.lang.IllegalArgumentException',
  'java.lang.IllegalStateException',
  'java.lang.NullPointerException',
  'java.lang.ClassCastException',
  'java.lang.IndexOutOfBoundsException',
  'java.lang.ArrayIndexOutOfBoundsException',
  'java.lang.StringIndexOutOfBoundsException',
  'java.lang.NumberFormatException',
  'java.lang.UnsupportedOperationException',
  'java.lang.ArithmeticException',
  'java.lang.SecurityException',
  'java.util.NoSuchElementException',
  'java.util.ConcurrentModificationException',
  'java.util.InputMismatchException',
  'java.io.UncheckedIOException',
  'java.time.DateTimeException',
  'java.time.format.DateTimeParseException',
  'java.util.regex.PatternSyntaxException',
]);
const UNSUPPORTED =
  'a catch clause of a differing exception type needs a try that is only a constructor call';
const EXCEPTION_USE = [
  'the catch body uses the exception where its type cannot be shared: only a call of a Throwable method',
  'or an argument of a new object whose class has one constructor of that size',
].join(' ');

export function siteOf(node: Node): CatchSite {
  const formal = parentOf(parentOf(node));
  const clause = parentOf(formal);
  const tryNode = parentOf(clause);
  return {
    clause,
    tryNode,
    formal,
    name: required(formal, 'name').text,
    handler: required(clause, 'body'),
    body: required(tryNode, 'body'),
  };
}

function isLastCatch({ clause, tryNode }: CatchSite): boolean {
  return (
    present(tryNode.children.filter(({ type }) => type === 'catch_clause').at(-1)).id === clause.id
  );
}

function isAllowedUse(node: Node, typeSources?: TypeSources): boolean {
  const parent = parentOf(node);
  const receiver = parent.type === 'method_invocation' && field(parent, 'object')?.id === node.id;
  if (receiver) {
    return THROWABLE.has(required(parent, 'name').text);
  }
  return (
    parent.type === 'argument_list' &&
    parentOf(parent).type === 'object_creation_expression' &&
    isSingleConstructor(parentOf(parent), typeSources)
  );
}

function bodyProblem({ body }: CatchSite, creationIds: ReadonlySet<number>): string | undefined {
  const unsafe = descendants(body).some(
    (node) =>
      FORBIDDEN.has(node.type) &&
      !(node.type === 'object_creation_expression' && creationIds.has(required(node, 'type').id)),
  );
  return unsafe ? UNSUPPORTED : undefined;
}

function handlerProblem(
  { handler, name }: CatchSite,
  typeSources?: TypeSources,
): string | undefined {
  const uses = descendants(handler).filter(
    (node) => node.type === 'identifier' && node.text === name && roleOf(node) === 'reference',
  );
  return uses.every((node) => isAllowedUse(node, typeSources)) ? undefined : EXCEPTION_USE;
}

export function catchProblem(
  sites: CatchSite,
  creationIds: ReadonlySet<number>,
  typeSources?: TypeSources,
): string | undefined {
  if (sites.tryNode.type !== 'try_statement') {
    return UNSUPPORTED;
  }
  return isLastCatch(sites)
    ? (bodyProblem(sites, creationIds) ?? handlerProblem(sites, typeSources))
    : UNSUPPORTED;
}

export function catchText(
  site: CatchSite,
  { names, unit, text }: { names: CatchNames; unit: string; text: string },
  render: (node: Node) => string,
): string {
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
${indent}${unit}throw ${names.precise ? '' : '(RuntimeException) '}${names.caught};
${indent}}
${indent}${declared} = ${names.failure}.cast(${names.caught});${render(handler).slice(1, -1)}}`;
}

function isUncheckedType(node: Node): boolean {
  const text = node.text.replaceAll(/\s+/gu, '');
  const known = text.includes('.')
    ? text
    : (qualified(text, importsOf(node.tree.rootNode)) ?? `java.lang.${text}`);
  return UNCHECKED.has(known);
}

export function isUnchecked(hole: OccurrenceHole): boolean {
  return hole.occurrences.every(({ a, b }) => isUncheckedType(a) && isUncheckedType(b));
}

function isErrorName(node: Node): boolean {
  const name = present(node.text.replaceAll(/\s+/gu, '').split('.').at(-1));
  return name === 'Throwable' || name.endsWith('Error');
}

export function isNotException(hole: OccurrenceHole): boolean {
  return hole.occurrences.some(({ a, b }) => isErrorName(a) || isErrorName(b));
}
