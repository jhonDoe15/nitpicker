import { annotationsOf, modifiersOf } from '../syntax/kotlin-annotations.mjs';
import { identifierOf, kid, kids } from '../syntax/kotlin-tree.mjs';
import { typeOf } from '../syntax/kotlin-types.mjs';

export function ancestors(declaration) {
  const chain = [declaration];
  for (const current of chain) {
    if (current.parent !== undefined) {
      chain.push(current.parent);
    }
  }
  return chain;
}

function parameterOf(source, node) {
  return {
    node,
    name: identifierOf(source, node),
    modifiers: modifiersOf(node),
    annotations: annotationsOf(source, node),
    type: typeOf(source, kid(node, 'TYPE_REFERENCE')),
    defaulted: kid(node, 'EQ') !== undefined,
    mutable: kid(node, 'var') !== undefined,
    property: kid(node, 'val') !== undefined || kid(node, 'var') !== undefined,
  };
}

function parametersOf(source, constructorOrFunction) {
  return kids(kid(constructorOrFunction, 'VALUE_PARAMETER_LIST'), 'VALUE_PARAMETER').map((node) =>
    parameterOf(source, node),
  );
}

function bodyOf(node) {
  const block = kid(node, 'BLOCK');
  if (block !== undefined) {
    return block;
  }
  const children = kids(node);
  const equals = children.findIndex((child) => child.t === 'EQ');
  return equals < 0 ? undefined : children[equals + 1];
}

export function functionOf(source, node, owner) {
  return {
    node,
    name: identifierOf(source, node) ?? '',
    modifiers: modifiersOf(node),
    annotations: annotationsOf(source, node),
    params: parametersOf(source, node),
    returnType: typeOf(source, kids(node, 'TYPE_REFERENCE').at(-1)),
    body: bodyOf(node),
    owner,
  };
}

export function propertyOf(source, node, owner) {
  return {
    node,
    name: identifierOf(source, node) ?? '',
    modifiers: modifiersOf(node),
    annotations: annotationsOf(source, node),
    type: typeOf(source, kid(node, 'TYPE_REFERENCE')),
    mutable: kid(node, 'var') !== undefined,
    delegated: kid(node, 'PROPERTY_DELEGATE') !== undefined,
    owner,
    fromConstructor: false,
  };
}

export function constructorProperty(parameter, owner) {
  return {
    node: parameter.node,
    name: parameter.name,
    modifiers: parameter.modifiers,
    annotations: parameter.annotations,
    type: parameter.type,
    mutable: parameter.mutable,
    delegated: false,
    owner,
    fromConstructor: true,
  };
}

export function constructorOf(source, node, primary) {
  return {
    node,
    primary,
    modifiers: modifiersOf(node),
    annotations: annotationsOf(source, node),
    params: parametersOf(source, node),
  };
}
