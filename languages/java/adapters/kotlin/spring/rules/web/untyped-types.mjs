import { ANY_TYPES, JSON_NODES, MAP_TYPES, WRAPPER_TYPES } from '../../names/spring-body-types.mjs';

function isAny(file, type) {
  return type !== undefined && file.resolver.matches(type.name, ANY_TYPES);
}

function isLeaf(file, type) {
  if (type === undefined) {
    return true;
  }
  if (isAny(file, type) || file.resolver.matches(type.name, JSON_NODES)) {
    return true;
  }
  return (
    file.resolver.matches(type.name, MAP_TYPES) &&
    (type.args.length < 2 || type.args[1] === undefined || isAny(file, type.args[1]))
  );
}

function innerOf(file, type) {
  if (type === undefined) {
    return [];
  }
  if (file.resolver.matches(type.name, MAP_TYPES)) {
    return type.args.slice(1, 2);
  }
  return file.resolver.matches(type.name, WRAPPER_TYPES) ? type.args : [];
}

export function isUntyped(file, type) {
  if (type === undefined) {
    return false;
  }
  return (
    isLeaf(file, type) ||
    innerOf(file, type).some(
      (argument) =>
        isLeaf(file, argument) || innerOf(file, argument).some((nested) => isLeaf(file, nested)),
    )
  );
}
