import { wordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import { isClientName } from './builders.mjs';
import { tableKey } from './table-names.mjs';

const UPSERT = 'upsert';
const UPDATE = 'update';
const FIND_ONE = 'findOne';
const PENULTIMATE = -2;
const ANTEPENULTIMATE = -3;
const PRISMA_MIN_STEPS = 3;

const METHODS = {
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

function argumentTable(node) {
  if (node?.type === 'Identifier' && MODEL_NAME.test(node.name)) {
    return tableKey(node.name);
  }
  if (node?.type === 'NewExpression' && node.callee.type === 'Identifier') {
    return tableKey(node.callee.name);
  }
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? tableKey(node.value)
    : undefined;
}

function prisma({ root, steps }, kind, orms) {
  const method = steps.at(-1);
  const model = steps.at(PENULTIMATE);
  const client = steps.length >= PRISMA_MIN_STEPS ? steps.at(ANTEPENULTIMATE).name : root;
  const modelName = model?.name;
  const isModel =
    model?.args === undefined && typeof modelName === 'string' && !modelName.startsWith('$');
  const matches = orms.includes('prisma') && METHODS.prisma[kind].has(method.name);
  return matches &&
    method.args !== undefined &&
    isModel &&
    isClientName(client) &&
    !/^[A-Z]/u.test(model.name)
    ? { orm: 'prisma', table: tableKey(model.name) }
    : undefined;
}

function repository({ root, steps }, kind, orms) {
  const method = steps.at(-1);
  const receiver = steps.length >= 2 ? steps.at(PENULTIMATE) : { name: root, args: undefined };
  const orm = ['typeorm', 'mikro'].find(
    (each) => orms.includes(each) && METHODS[each][kind].has(method.name),
  );
  if (orm === undefined || method.args === undefined || receiver.name === undefined) {
    return undefined;
  }
  if (receiver.args !== undefined) {
    const isGetter = REPOSITORY_GETTERS.has(receiver.name);
    return isGetter ? { orm, table: argumentTable(receiver.args[0]) } : undefined;
  }
  const last = wordsOf(receiver.name).at(-1);
  if (REPOSITORY_WORDS.has(last)) {
    return { orm, table: tableKey(receiver.name) };
  }
  return MANAGER_WORDS.has(last) ? { orm, table: argumentTable(method.args[0]) } : undefined;
}

function sequelize({ root, steps }, kind, orms) {
  const method = steps.at(-1);
  const receiver = steps.length >= 2 ? steps.at(PENULTIMATE) : { name: root, args: undefined };
  const name = receiver.name ?? '';
  const isModel = (MODEL_NAME.test(name) && !GLOBAL_OBJECTS.has(name)) || name.endsWith('Model');
  const matches = orms.includes('sequelize') && METHODS.sequelize[kind].has(method.name);
  return matches && method.args !== undefined && receiver.args === undefined && isModel
    ? { orm: 'sequelize', table: tableKey(name) }
    : undefined;
}

export function modelSite(chain, kind, orms) {
  if (chain.steps.length === 0) {
    return undefined;
  }
  return prisma(chain, kind, orms) ?? repository(chain, kind, orms) ?? sequelize(chain, kind, orms);
}
