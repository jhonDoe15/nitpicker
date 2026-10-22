import { annotationsOf, modifiersOf } from '../syntax/kotlin-annotations.mjs';
import {
  constructorOf,
  constructorProperty,
  functionOf,
  propertyOf,
} from './kotlin-declarations.mjs';
import { identifierOf, kid, kids } from '../syntax/kotlin-tree.mjs';
import { typeOf } from '../syntax/kotlin-types.mjs';

function classKindOf(node, modifiers) {
  if (node.t === 'OBJECT_DECLARATION') {
    return 'object';
  }
  if (kid(node, 'interface') !== undefined) {
    return 'interface';
  }
  if (modifiers.has('enum')) {
    return 'enum';
  }
  return modifiers.has('annotation') ? 'annotation' : 'class';
}

function supertypesOf(source, node) {
  return kids(kid(node, 'SUPER_TYPE_LIST')).flatMap((entry) => {
    const reference =
      entry.t === 'SUPER_TYPE_CALL_ENTRY'
        ? kid(kid(entry, 'CONSTRUCTOR_CALLEE'), 'TYPE_REFERENCE')
        : kid(entry, 'TYPE_REFERENCE');
    const type = typeOf(source, reference);
    return type === undefined ? [] : [{ type, called: entry.t === 'SUPER_TYPE_CALL_ENTRY' }];
  });
}

function nestedShellOf(source, member, declaration) {
  switch (member.t) {
    case 'PROPERTY':
      declaration.properties.push(propertyOf(source, member, declaration));
      return undefined;
    case 'FUN':
      declaration.functions.push(functionOf(source, member, declaration));
      return undefined;
    case 'SECONDARY_CONSTRUCTOR':
      declaration.constructors.push(constructorOf(source, member, false));
      return undefined;
    case 'CLASS':
    case 'OBJECT_DECLARATION': {
      const nested = shellOf(source, member, declaration);
      declaration.nested.push(nested);
      return { node: member, declaration: nested };
    }
    default:
      return undefined;
  }
}

function shellOf(source, node, parent) {
  const modifiers = modifiersOf(node);
  const declaration = {
    node,
    name: identifierOf(source, node) ?? (modifiers.has('companion') ? 'Companion' : ''),
    kind: classKindOf(node, modifiers),
    modifiers,
    annotations: annotationsOf(source, node),
    supertypes: supertypesOf(source, node),
    constructors: [],
    properties: [],
    functions: [],
    nested: [],
    parent,
  };
  const primary = kid(node, 'PRIMARY_CONSTRUCTOR');
  if (primary !== undefined) {
    const constructed = constructorOf(source, primary, true);
    declaration.constructors.push(constructed);
    declaration.properties.push(
      ...constructed.params
        .filter((parameter) => parameter.property)
        .map((parameter) => constructorProperty(parameter, declaration)),
    );
  }
  return declaration;
}

function nestedClassesOf(source, { node, declaration }) {
  return kids(kid(node, 'CLASS_BODY'))
    .map((member) => nestedShellOf(source, member, declaration))
    .filter((nested) => nested !== undefined);
}

export function classOf(source, node, parent) {
  const root = shellOf(source, node, parent);
  const pending = [{ node, declaration: root }];
  for (const entry of pending) {
    pending.push(...nestedClassesOf(source, entry));
  }
  return root;
}

export function flattenClasses(classes) {
  const flat = [...classes];
  for (const [index, declaration] of flat.entries()) {
    flat.splice(index + 1, 0, ...declaration.nested);
  }
  return flat;
}
