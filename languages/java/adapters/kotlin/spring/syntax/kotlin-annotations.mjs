import { kid, kids, textOf } from './kotlin-tree.mjs';
import { typeOf } from './kotlin-types.mjs';

function argumentOf(source, node) {
  const name = kid(node, 'VALUE_ARGUMENT_NAME');
  const value = kids(node).find((child) => !['VALUE_ARGUMENT_NAME', 'EQ'].includes(child.t));
  return {
    name: name === undefined ? undefined : textOf(source, name),
    node: value,
    text: textOf(source, value),
  };
}

function annotationOf(source, entry) {
  const callee = kid(entry, 'CONSTRUCTOR_CALLEE');
  return {
    node: entry,
    name: typeOf(source, kid(callee, 'TYPE_REFERENCE'))?.name ?? '',
    target: textOf(source, kid(entry, 'ANNOTATION_TARGET')),
    args: kids(kid(entry, 'VALUE_ARGUMENT_LIST'), 'VALUE_ARGUMENT').map((node) =>
      argumentOf(source, node),
    ),
  };
}

export function annotationsOf(source, declaration) {
  return kids(kid(declaration, 'MODIFIER_LIST'))
    .flatMap((child) => (child.t === 'ANNOTATION' ? kids(child, 'ANNOTATION_ENTRY') : [child]))
    .filter((child) => child.t === 'ANNOTATION_ENTRY')
    .map((entry) => annotationOf(source, entry));
}

export function modifiersOf(declaration) {
  return new Set(
    kids(kid(declaration, 'MODIFIER_LIST'))
      .filter((child) => child.c === undefined)
      .map((child) => child.t),
  );
}

export function argumentValue(annotation, name) {
  return annotation.args.find(
    (argument, index) =>
      argument.name === name || (argument.name === undefined && index === 0 && name === 'value'),
  );
}

export function hasArgument(annotation, name) {
  return argumentValue(annotation, name) !== undefined;
}
