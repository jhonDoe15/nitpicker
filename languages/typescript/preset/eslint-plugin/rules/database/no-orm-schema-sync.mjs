import { findVariable } from '../analysis/constant-resolution.mjs';
import { memberName, propertyNamed, unwrapped } from '../security/security-values.mjs';
import {
  constructedName,
  initializerOf,
  isForeignReceiver,
  MIKRO_ORM,
  moduleScope,
  ormLocals,
  SEQUELIZE,
  shortText,
  TYPEORM,
} from './orm-modules.mjs';
import {
  hasKey,
  hasOpaqueSpread,
  isOrmOptions,
  isSwitchedOn,
  objectOf,
  propertyKey,
} from './orm-options.mjs';

const SEQUELIZE_TEXT = /sequelize/iu;
const DATA_SOURCE_TEXT = /data_?source|connection|database|\borm\b|^(?:this\.)?db$/iu;
const DATA_SOURCE_FACTORIES = new Set(['createConnection', 'initialize']);
const MODEL_NAME = /^[A-Z]/u;
const TYPEORM_METHODS = new Set(['synchronize', 'dropDatabase']);
const MIKRO_ORM_METHODS = new Set([
  'updateSchema',
  'createSchema',
  'dropSchema',
  'refreshDatabase',
]);
const ENSURE_OPTIONS = ['create', 'clear'];
const SYNC_KEYS = new Set(['synchronize', 'dropSchema']);

function report(context, node, form) {
  context.report({ node, messageId: 'schemaSync', data: { form } });
}

function isSequelizeConstruction(scope, init) {
  const names = ormLocals(scope, 'Sequelize').add('Sequelize');
  return init?.type === 'NewExpression' && names.has(constructedName(init));
}

function isModel(scope, receiver) {
  const target = unwrapped(receiver);
  if (target.type !== 'Identifier' || !MODEL_NAME.test(target.name)) {
    return false;
  }
  const binding = scope.bindings.get(target.name);
  const declared = findVariable(scope.context, target, target.name)?.defs[0]?.type === 'ClassName';
  return declared || binding?.source.startsWith('.') === true;
}

function isSequelizeInstance(scope, receiver) {
  return (
    SEQUELIZE_TEXT.test(scope.context.sourceCode.getText(receiver)) ||
    isSequelizeConstruction(scope, initializerOf(scope, receiver)) ||
    (scope.families.has(SEQUELIZE) && isModel(scope, receiver))
  );
}

function isDataSource(scope, receiver) {
  const init = initializerOf(scope, receiver);
  const made =
    (init?.type === 'NewExpression' && constructedName(init) === 'DataSource') ||
    (init?.type === 'CallExpression' && DATA_SOURCE_FACTORIES.has(constructedName(init)));
  return made || DATA_SOURCE_TEXT.test(scope.context.sourceCode.getText(receiver));
}

function ensuresSchema(context, call) {
  const options = objectOf(context, call.arguments[0]);
  return (
    options !== undefined &&
    ENSURE_OPTIONS.some((key) => {
      const value = propertyNamed(context, options, key);
      return value !== undefined && isSwitchedOn(context, value);
    })
  );
}

function isSchemaCall(scope, call, { method, receiver }) {
  if (method === 'sync') {
    return isSequelizeInstance(scope, receiver);
  }
  if (TYPEORM_METHODS.has(method)) {
    return scope.families.has(TYPEORM) && isDataSource(scope, receiver);
  }
  if (MIKRO_ORM_METHODS.has(method)) {
    return scope.families.has(MIKRO_ORM);
  }
  return (
    method === 'ensureDatabase' &&
    scope.families.has(MIKRO_ORM) &&
    ensuresSchema(scope.context, call)
  );
}

function syncsModels(scope, object) {
  return (
    scope.families.has(SEQUELIZE) &&
    !hasKey(scope.context, object, 'synchronize') &&
    !hasOpaqueSpread(scope.context, object)
  );
}

function checkProperty(scope, node) {
  const { context } = scope;
  const key = propertyKey(node);
  const object = node.parent;
  const watched = SYNC_KEYS.has(key) || key === 'autoLoadModels';
  if (!watched || !isOrmOptions(scope, object) || !isSwitchedOn(context, node.value)) {
    return;
  }
  if (SYNC_KEYS.has(key)) {
    report(context, node, `${key}: ${shortText(context, node.value, 'true')}`);
  } else if (syncsModels(scope, object)) {
    report(context, node, 'autoLoadModels: true` without `synchronize: false');
  }
}

function checkCall(scope, node) {
  const callee = unwrapped(node.callee);
  const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  if (method === undefined || isForeignReceiver(scope, callee.object)) {
    return;
  }
  if (isSchemaCall(scope, node, { method, receiver: callee.object })) {
    const receiver = shortText(scope.context, callee.object, undefined);
    report(scope.context, node, receiver === undefined ? `${method}()` : `${receiver}.${method}()`);
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow the ORM creating or changing the database schema when the application starts',
    },
    schema: [],
    messages: {
      schemaSync:
        '`{{form}}` lets the ORM create, alter or drop tables when the application starts: a deploy can drop columns and their data, instances race to change the schema, and the schema drifts from what the migrations record. A value guarded by an environment check still changes the schema in every other environment. Change the schema with migrations instead (TypeORM migrations with `migrationsRun` or `typeorm migration:run`, `sequelize-cli db:migrate`, MikroORM `orm.migrator.up()`, `prisma migrate deploy`). An exception fits only for a local script outside the application, such as a seed or a dev tool.',
    },
  },
  create(context) {
    const scope = moduleScope(context);
    return {
      Property(node) {
        checkProperty(scope, node);
      },
      CallExpression(node) {
        checkCall(scope, node);
      },
    };
  },
};
