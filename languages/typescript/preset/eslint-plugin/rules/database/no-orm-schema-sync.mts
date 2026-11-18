import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import {
  memberName,
  propertyNamed,
  unwrapped,
  type Context,
} from '../security/security-values.mts';
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
  type ModuleScope,
} from './orm-modules.mts';
import {
  hasKey,
  hasOpaqueSpread,
  isOrmOptions,
  isSwitchedOn,
  objectOf,
  propertyKey,
} from './orm-options.mts';

const SEQUELIZE_TEXT = /sequelize/iu;
const DATA_SOURCE_TEXT = /data_?source|connection|database|\borm\b|^(?:this\.)?db$/iu;
const DATA_SOURCE_FACTORIES = new Set<string | undefined>(['createConnection', 'initialize']);
const MODEL_NAME = /^[A-Z]/u;
const SYNCHRONIZE = 'synchronize';
const TYPEORM_METHODS = new Set([SYNCHRONIZE, 'dropDatabase']);
const MIKRO_ORM_METHODS = new Set<string | undefined>([
  'updateSchema',
  'createSchema',
  'dropSchema',
  'refreshDatabase',
]);
const ENSURE_OPTIONS = ['create', 'clear'];
const SYNC_KEYS = new Set([SYNCHRONIZE, 'dropSchema']);

function report(context: Context, node: TSESTree.Node, form: string): void {
  context.report({ node, messageId: 'schemaSync', data: { form } });
}

function isSequelizeConstruction(scope: ModuleScope, init: TSESTree.Node | undefined): boolean {
  const names = ormLocals(scope, 'Sequelize').add('Sequelize');
  return init?.type === AST_NODE_TYPES.NewExpression && names.has(constructedName(init));
}

function isModel(scope: ModuleScope, receiver: TSESTree.Node): boolean {
  const target = unwrapped(receiver);
  if (target.type !== AST_NODE_TYPES.Identifier || !MODEL_NAME.test(target.name)) {
    return false;
  }
  const binding = scope.bindings.get(target.name);
  const declared =
    findVariable(scope.context, target, target.name)?.defs[0]?.type ===
    TSESLint.Scope.DefinitionType.ClassName;
  return declared || binding?.source.startsWith('.') === true;
}

function isSequelizeInstance(scope: ModuleScope, receiver: TSESTree.Node): boolean {
  return (
    SEQUELIZE_TEXT.test(scope.context.sourceCode.getText(receiver)) ||
    isSequelizeConstruction(scope, initializerOf(scope, receiver)) ||
    (scope.families.has(SEQUELIZE) && isModel(scope, receiver))
  );
}

function isDataSource(scope: ModuleScope, receiver: TSESTree.Node): boolean {
  const init = initializerOf(scope, receiver);
  const made =
    (init?.type === AST_NODE_TYPES.NewExpression && constructedName(init) === 'DataSource') ||
    (init?.type === AST_NODE_TYPES.CallExpression &&
      DATA_SOURCE_FACTORIES.has(constructedName(init)));
  return made || DATA_SOURCE_TEXT.test(scope.context.sourceCode.getText(receiver));
}

function ensuresSchema(context: Context, call: TSESTree.CallExpression): boolean {
  const options = objectOf(context, call.arguments[0]);
  return (
    options !== undefined &&
    ENSURE_OPTIONS.some((key) => {
      const value = propertyNamed(context, options, key);
      return value !== undefined && isSwitchedOn(context, value);
    })
  );
}

function isSchemaCall(
  scope: ModuleScope,
  call: TSESTree.CallExpression,
  { method, receiver }: { readonly method: string; readonly receiver: TSESTree.Node },
): boolean {
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

function syncsModels(scope: ModuleScope, object: TSESTree.ObjectExpression): boolean {
  return (
    scope.families.has(SEQUELIZE) &&
    !hasKey(scope.context, object, SYNCHRONIZE) &&
    !hasOpaqueSpread(scope.context, object)
  );
}

function checkProperty(scope: ModuleScope, node: TSESTree.Property): void {
  const { context } = scope;
  const key = propertyKey(node);
  const object = node.parent;
  if (key === undefined || object.type !== AST_NODE_TYPES.ObjectExpression) {
    return;
  }
  const watched = SYNC_KEYS.has(key) || key === 'autoLoadModels';
  if (!(watched && isOrmOptions(scope, object) && isSwitchedOn(context, node.value))) {
    return;
  }
  if (SYNC_KEYS.has(key)) {
    report(context, node, `${key}: ${shortText(context, node.value, 'true')}`);
  } else if (syncsModels(scope, object)) {
    report(context, node, 'autoLoadModels: true` without `synchronize: false');
  }
}

function checkCall(scope: ModuleScope, node: TSESTree.CallExpression): void {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return;
  }
  const method = memberName(callee);
  if (method === undefined || isForeignReceiver(scope, callee.object)) {
    return;
  }
  if (isSchemaCall(scope, node, { method, receiver: callee.object })) {
    const receiver = shortText(scope.context, callee.object, undefined);
    report(scope.context, node, receiver === undefined ? `${method}()` : `${receiver}.${method}()`);
  }
}

export const rule: TSESLint.RuleModule<'schemaSync'> = {
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
