import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stringValue } from '../analysis/constant-resolution.mjs';
import { nearestManifest } from '../dependencies/package-manifest.mjs';
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
const SELECT_IN = 'select-in';
const MIKRO_ORM_CORE = 'node_modules/@mikro-orm/core/package.json';
const MIKRO_ORM_CONFIGS = ['', 'src/'].flatMap((folder) =>
  ['ts', 'js', 'mjs', 'cjs'].map((extension) => `${folder}mikro-orm.config.${extension}`),
);
const SELECT_IN_DEFAULT = /\bloadStrategy\s*:\s*(?:['"]select-in['"]|LoadStrategy\.SELECT_IN\b)/u;
const JOINED_SINCE_MAJOR = 6;

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

function objectEntries(context, object, prefix) {
  return object.properties.flatMap((property) => {
    const key = staticKey(property);
    const value = resolvedValue(context, property.value);
    if (key === undefined || (value?.type === 'Literal' && value.value !== true)) {
      return [];
    }
    return [{ path: [...prefix, key], value }];
  });
}

function objectPaths(context, object) {
  const pending = objectEntries(context, object, []);
  for (const { path, value } of pending) {
    if (value?.type === 'ObjectExpression') {
      pending.push(...objectEntries(context, value, path));
    }
  }
  return pending.map(({ path }) => path);
}

function listedPaths(context, value) {
  const list = resolvedValue(context, value);
  if (list?.type === 'ObjectExpression') {
    return objectPaths(context, list);
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

function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function majorVersion(directory) {
  const text = readText(path.join(directory, MIKRO_ORM_CORE));
  const version = text === '' ? undefined : JSON.parse(text).version;
  return typeof version === 'string' ? Number.parseInt(version, 10) : undefined;
}

function projectJoinsByDefault(context) {
  const manifest = nearestManifest(path.dirname(context.filename));
  if (manifest?.kind !== 'manifest') {
    return true;
  }
  const directory = path.dirname(manifest.file);
  const major = majorVersion(directory);
  if (major !== undefined && major < JOINED_SINCE_MAJOR) {
    return false;
  }
  return !MIKRO_ORM_CONFIGS.some((file) =>
    SELECT_IN_DEFAULT.test(readText(path.join(directory, file))),
  );
}

function strategyOf(context, options) {
  const strategy = resolvedValue(context, propertyNamed(context, options, 'strategy'));
  if (strategy?.type === 'MemberExpression') {
    return memberName(strategy) === 'JOINED' ? JOINED : SELECT_IN;
  }
  return stringValue(strategy);
}

function isJoinedStrategy(context, options) {
  const strategy = strategyOf(context, options);
  return strategy === undefined ? projectJoinsByDefault(context) : strategy === JOINED;
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
