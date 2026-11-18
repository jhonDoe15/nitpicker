import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstFileIn as untypedFirstFileIn } from '../../../../../../shared/filesystem.mjs';
import { stringValue } from '../analysis/constant-resolution.mts';
import { nearestManifest } from '../dependencies/package-manifest.mts';
import {
  memberName,
  propertyNamed,
  resolvedValue,
  staticKey,
  type Context,
} from '../security/security-values.mts';
import {
  declaredInPackage,
  joinPaths,
  resultEntity,
  type JoinSite,
  type Types,
} from './relation-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type MaybeNode = TSESTree.Node | undefined;
type PathEntry = { readonly path: readonly string[]; readonly value: MaybeNode };

const firstFileIn: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstFileIn;

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

function calledName(call: TSESTree.CallExpression): string | undefined {
  return call.callee.type === AST_NODE_TYPES.MemberExpression ? memberName(call.callee) : undefined;
}

function optionsWith(
  context: Context,
  call: TSESTree.CallExpression,
  name: string,
): TSESTree.Node | undefined {
  return call.arguments
    .map((argument) => resolvedValue(context, argument))
    .findLast(
      (argument) =>
        argument?.type === AST_NODE_TYPES.ObjectExpression &&
        propertyNamed(context, argument, name) !== undefined,
    );
}

function objectEntries(
  context: Context,
  object: TSESTree.ObjectExpression,
  prefix: readonly string[],
): PathEntry[] {
  return object.properties.flatMap((property) => {
    if (property.type !== AST_NODE_TYPES.Property) {
      return [];
    }
    const key = staticKey(property);
    const value = resolvedValue(context, property.value);
    if (key === undefined || (value?.type === AST_NODE_TYPES.Literal && value.value !== true)) {
      return [];
    }
    return [{ path: [...prefix, key], value }];
  });
}

function objectPaths(context: Context, object: TSESTree.ObjectExpression): (readonly string[])[] {
  const pending = objectEntries(context, object, []);
  for (const { path, value } of pending) {
    if (value?.type === AST_NODE_TYPES.ObjectExpression) {
      appendAll(pending, objectEntries(context, value, path));
    }
  }
  return pending.map(({ path }) => path);
}

function listedPaths(context: Context, value: MaybeNode): string[][] {
  const list = resolvedValue(context, value);
  if (list?.type === AST_NODE_TYPES.ObjectExpression) {
    return objectPaths(context, list).map((entry) => [...entry]);
  }
  const entries: readonly MaybeNode[] =
    list?.type === AST_NODE_TYPES.ArrayExpression
      ? list.elements.map((element) => element ?? undefined)
      : [list];
  return entries.flatMap((entry) => {
    const text = stringValue(resolvedValue(context, entry));
    if (text === undefined || MIKRO_ORM_WILDCARDS.has(text)) {
      return [];
    }
    const [head = ''] = text.split(':');
    return [head.split('.')];
  });
}

function isQueryStrategy(context: Context, options: MaybeNode): boolean {
  return (
    stringValue(resolvedValue(context, propertyNamed(context, options, 'relationLoadStrategy'))) ===
    'query'
  );
}

function textIn(directory: string, name: string): string {
  const file = firstFileIn(directory, [name]);
  return file === undefined ? '' : readFileSync(file, 'utf8');
}

function majorVersion(directory: string): number | undefined {
  const text = textIn(directory, MIKRO_ORM_CORE);
  const manifest: unknown = text === '' ? undefined : JSON.parse(text);
  const version: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'version')
      : undefined;
  return typeof version === 'string' ? Number.parseInt(version, 10) : undefined;
}

function projectJoinsByDefault(context: Context): boolean {
  const manifest = nearestManifest(path.dirname(context.filename));
  if (manifest?.kind !== 'manifest') {
    return true;
  }
  const directory = path.dirname(manifest.file);
  const major = majorVersion(directory);
  if (major !== undefined && major < JOINED_SINCE_MAJOR) {
    return false;
  }
  return !MIKRO_ORM_CONFIGS.some((file) => SELECT_IN_DEFAULT.test(textIn(directory, file)));
}

function strategyOf(context: Context, options: MaybeNode): string | undefined {
  const strategy = resolvedValue(context, propertyNamed(context, options, 'strategy'));
  if (strategy?.type === AST_NODE_TYPES.MemberExpression) {
    return memberName(strategy) === 'JOINED' ? JOINED : SELECT_IN;
  }
  return stringValue(strategy);
}

function isJoinedStrategy(context: Context, options: MaybeNode): boolean {
  const strategy = strategyOf(context, options);
  return strategy === undefined ? projectJoinsByDefault(context) : strategy === JOINED;
}

function typeormJoins(
  context: Context,
  types: Types,
  call: TSESTree.CallExpression,
): JoinSite | undefined {
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

function mikroOrmJoins(
  context: Context,
  types: Types,
  call: TSESTree.CallExpression,
): JoinSite | undefined {
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

export function findJoins(
  context: Context,
  types: Types,
  call: TSESTree.CallExpression,
): JoinSite | undefined {
  const name = calledName(call);
  return (
    (name !== undefined && TYPEORM_FINDS.has(name)
      ? typeormJoins(context, types, call)
      : undefined) ??
    (name !== undefined && MIKRO_ORM_FINDS.has(name)
      ? mikroOrmJoins(context, types, call)
      : undefined)
  );
}
