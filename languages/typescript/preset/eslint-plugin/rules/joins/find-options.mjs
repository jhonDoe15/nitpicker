import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  memberName,
  propertyNamed,
  resolvedValue,
  staticKey,
} from '../security/security-values.mjs';
import { declaredInPackage, joinPaths, resultEntity } from './relation-types.mjs';

const TYPEORM_FINDS = new Set(['find', 'findOne', 'findOneOrFail', 'findAndCount']);
const MIKRO_ORM_FINDS = new Set(['find', 'findOne', 'findOneOrFail', 'findAll', 'findAndCount']);
const MIKRO_ORM_WILDCARDS = new Set(['*', '$infer']);
const JOINED = 'joined';

function calledName(call) {
  return call.callee.type === 'MemberExpression' ? memberName(call.callee) : undefined;
}

function optionsWith(context, call, name) {
  return call.arguments
    .map((argument) => resolvedValue(context, argument))
    .findLast(
      (argument) =>
        argument?.type === 'ObjectExpression' &&
        propertyNamed(context, argument, name) !== undefined,
    );
}

function objectPaths(context, object, prefix) {
  return object.properties.flatMap((property) => {
    const key = staticKey(property);
    const value = resolvedValue(context, property.value);
    if (key === undefined || (value?.type === 'Literal' && value.value !== true)) {
      return [];
    }
    const path = [...prefix, key];
    return value?.type === 'ObjectExpression'
      ? [path, ...objectPaths(context, value, path)]
      : [path];
  });
}

function listedPaths(context, value) {
  const list = resolvedValue(context, value);
  if (list?.type === 'ObjectExpression') {
    return objectPaths(context, list, []);
  }
  const entries = list?.type === 'ArrayExpression' ? list.elements : [list];
  return entries
    .map((entry) => stringValue(resolvedValue(context, entry)))
    .filter((text) => text !== undefined && !MIKRO_ORM_WILDCARDS.has(text))
    .map((text) => text.split(':')[0].split('.'));
}

function isQueryStrategy(context, options) {
  return (
    stringValue(resolvedValue(context, propertyNamed(context, options, 'relationLoadStrategy'))) ===
    'query'
  );
}

function isJoinedStrategy(context, options) {
  const strategy = resolvedValue(context, propertyNamed(context, options, 'strategy'));
  return (
    stringValue(strategy) === JOINED ||
    (strategy?.type === 'MemberExpression' && memberName(strategy) === 'JOINED')
  );
}

function typeormJoins(context, types, call) {
  const options = optionsWith(context, call, 'relations');
  if (
    options === undefined ||
    isQueryStrategy(context, options) ||
    !declaredInPackage(types, call, ['typeorm'])
  ) {
    return undefined;
  }
  const paths = listedPaths(context, propertyNamed(context, options, 'relations'));
  return {
    orm: 'typeorm',
    node: options,
    joined: joinPaths(types, resultEntity(types, call), paths),
  };
}

function mikroOrmJoins(context, types, call) {
  const options = optionsWith(context, call, 'populate');
  if (
    options === undefined ||
    !isJoinedStrategy(context, options) ||
    !declaredInPackage(types, call, ['@mikro-orm'])
  ) {
    return undefined;
  }
  const paths = listedPaths(context, propertyNamed(context, options, 'populate'));
  return {
    orm: 'mikroOrm',
    node: options,
    joined: joinPaths(types, resultEntity(types, call), paths),
  };
}

export function findJoins(context, types, call) {
  const name = calledName(call);
  return (
    (TYPEORM_FINDS.has(name) ? typeormJoins(context, types, call) : undefined) ??
    (MIKRO_ORM_FINDS.has(name) ? mikroOrmJoins(context, types, call) : undefined)
  );
}
