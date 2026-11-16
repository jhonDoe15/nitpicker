import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import { isClientName, stepIn } from './builders.mts';
import type { CallChain, ChainStep, OrmKind, OrmSite } from './chains.mts';
import { tableKey } from './table-names.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;

const UPSERT = 'upsert';
const UPDATE = 'update';
const FIND_ONE = 'findOne';
const PENULTIMATE = -2;
const ANTEPENULTIMATE = -3;
const PRISMA_MIN_STEPS = 3;

const METHODS: Readonly<Record<string, Readonly<Record<OrmKind, ReadonlySet<string>>>>> = {
  prisma: {
    write: new Set([
      'create',
      'createMany',
      'createManyAndReturn',
      UPDATE,
      'updateMany',
      'updateManyAndReturn',
      UPSERT,
      'delete',
      'deleteMany',
    ]),
    read: new Set([
      'findUnique',
      'findFirst',
      'findMany',
      'findUniqueOrThrow',
      'findFirstOrThrow',
      'count',
    ]),
  },
  typeorm: {
    write: new Set([
      'save',
      'insert',
      UPDATE,
      UPSERT,
      'delete',
      'remove',
      'softDelete',
      'softRemove',
      'restore',
      'recover',
      'increment',
      'decrement',
    ]),
    read: new Set([
      'find',
      'findBy',
      FIND_ONE,
      'findOneBy',
      'findOneOrFail',
      'findOneByOrFail',
      'findAndCount',
      'count',
      'countBy',
      'exist',
      'exists',
      'existsBy',
    ]),
  },
  mikro: {
    write: new Set([
      'persistAndFlush',
      'removeAndFlush',
      'nativeInsert',
      'nativeUpdate',
      'nativeDelete',
      UPSERT,
      'upsertMany',
      'insert',
      'insertMany',
    ]),
    read: new Set(['find', FIND_ONE, 'findOneOrFail', 'findAndCount', 'count']),
  },
  sequelize: {
    write: new Set([
      'create',
      'bulkCreate',
      UPDATE,
      'destroy',
      UPSERT,
      'increment',
      'decrement',
      'restore',
      'findOrCreate',
    ]),
    read: new Set([FIND_ONE, 'findAll', 'findByPk', 'findAndCountAll', 'count']),
  },
};
const REPOSITORY_WORDS = new Set(['repository', 'repo', 'dao']);
const MANAGER_WORDS = new Set(['manager', 'em', 'entitymanager', 'tx', 'trx', 'txn']);
const REPOSITORY_GETTERS = new Set(['getRepository', 'getCustomRepository']);
const GLOBAL_OBJECTS = new Set([
  'Object',
  'Array',
  'Promise',
  'Map',
  'Set',
  'JSON',
  'Math',
  'Reflect',
  'Number',
  'String',
  'Date',
  'Buffer',
  'Symbol',
  'Intl',
  'Proxy',
  'WeakMap',
  'WeakSet',
]);
const MODEL_NAME = /^[A-Z]/u;

type Receiver = Pick<ChainStep, 'name' | 'args'>;

function methodsOf(orm: string, kind: OrmKind): ReadonlySet<string> {
  return METHODS[orm]?.[kind] ?? new Set();
}

function receiverOf({ root, steps }: CallChain): Receiver {
  const previous = steps.at(PENULTIMATE);
  return steps.length >= 2 && previous !== undefined ? previous : { name: root, args: undefined };
}

function argumentTable(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Identifier && MODEL_NAME.test(node.name)) {
    return tableKey(node.name);
  }
  if (
    node?.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier
  ) {
    return tableKey(node.callee.name);
  }
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? tableKey(node.value)
    : undefined;
}

function prisma(
  chain: CallChain,
  method: ChainStep,
  kind: OrmKind,
  orms: readonly string[],
): OrmSite | undefined {
  const { root, steps } = chain;
  const model = steps.at(PENULTIMATE);
  const client = steps.length >= PRISMA_MIN_STEPS ? steps.at(ANTEPENULTIMATE)?.name : root;
  const modelName = model?.name;
  const isModel =
    model?.args === undefined && typeof modelName === 'string' && !modelName.startsWith('$');
  const matches = orms.includes('prisma') && stepIn(methodsOf('prisma', kind), method);
  return matches &&
    method.args !== undefined &&
    isModel &&
    isClientName(client) &&
    !MODEL_NAME.test(modelName)
    ? { orm: 'prisma', table: tableKey(modelName) }
    : undefined;
}

function repository(
  chain: CallChain,
  method: ChainStep,
  kind: OrmKind,
  orms: readonly string[],
): OrmSite | undefined {
  const receiver = receiverOf(chain);
  const orm = ['typeorm', 'mikro'].find(
    (each) => orms.includes(each) && stepIn(methodsOf(each, kind), method),
  );
  if (orm === undefined || method.args === undefined || receiver.name === undefined) {
    return undefined;
  }
  if (receiver.args !== undefined) {
    const isGetter = REPOSITORY_GETTERS.has(receiver.name);
    return isGetter ? { orm, table: argumentTable(receiver.args[0]) } : undefined;
  }
  const last = wordsOf(receiver.name).at(-1);
  if (last !== undefined && REPOSITORY_WORDS.has(last)) {
    return { orm, table: tableKey(receiver.name) };
  }
  return last !== undefined && MANAGER_WORDS.has(last)
    ? { orm, table: argumentTable(method.args[0]) }
    : undefined;
}

function sequelize(
  chain: CallChain,
  method: ChainStep,
  kind: OrmKind,
  orms: readonly string[],
): OrmSite | undefined {
  const receiver = receiverOf(chain);
  const name = receiver.name ?? '';
  const isModel = (MODEL_NAME.test(name) && !GLOBAL_OBJECTS.has(name)) || name.endsWith('Model');
  const matches = orms.includes('sequelize') && stepIn(methodsOf('sequelize', kind), method);
  return matches && method.args !== undefined && receiver.args === undefined && isModel
    ? { orm: 'sequelize', table: tableKey(name) }
    : undefined;
}

export function modelSite(
  chain: CallChain,
  kind: OrmKind,
  orms: readonly string[],
): OrmSite | undefined {
  const method = chain.steps.at(-1);
  if (method === undefined) {
    return undefined;
  }
  return (
    prisma(chain, method, kind, orms) ??
    repository(chain, method, kind, orms) ??
    sequelize(chain, method, kind, orms)
  );
}
