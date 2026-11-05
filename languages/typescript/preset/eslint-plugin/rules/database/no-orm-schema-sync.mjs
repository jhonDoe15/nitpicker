import { memberName, propertyNamed, unwrapped } from '../security/security-values.mjs';
import {
  callForm,
  hasKey,
  hasOpaqueSpread,
  isOrmModule,
  isSwitchedOn,
  isTypeOrmShaped,
  MIKRO_ORM,
  objectOf,
  ormFamilies,
  packageImports,
  propertyKey,
  rootName,
  SEQUELIZE,
  TYPEORM,
} from './orm-options.mjs';

const SEQUELIZE_RECEIVER = /sequelize/iu;
const TYPEORM_METHODS = new Set(['synchronize', 'dropDatabase']);
const MIKRO_ORM_METHODS = new Set([
  'updateSchema',
  'createSchema',
  'dropSchema',
  'refreshDatabase',
]);
const ENSURE_OPTIONS = ['create', 'clear'];
const SYNC_KEYS = new Set(['synchronize', 'dropSchema']);

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
    const program = context.sourceCode.ast;
    const families = ormFamilies(program);
    const imports = packageImports(program);

    function report(node, form) {
      context.report({ node, messageId: 'schemaSync', data: { form } });
    }

    function isForeign(receiver) {
      const source = imports.get(rootName(receiver));
      return source !== undefined && !isOrmModule(source);
    }

    function isSequelizeSync(receiver) {
      return (
        families.has(SEQUELIZE) || SEQUELIZE_RECEIVER.test(context.sourceCode.getText(receiver))
      );
    }

    function ensuresSchema(call) {
      const options = objectOf(context, call.arguments[0]);
      return (
        options !== undefined &&
        ENSURE_OPTIONS.some((key) => {
          const value = propertyNamed(context, options, key);
          return value !== undefined && isSwitchedOn(context, value);
        })
      );
    }

    function isSchemaCall(call, method, receiver) {
      if (method === 'sync') {
        return isSequelizeSync(receiver);
      }
      if (TYPEORM_METHODS.has(method)) {
        return families.has(TYPEORM);
      }
      if (MIKRO_ORM_METHODS.has(method)) {
        return families.has(MIKRO_ORM);
      }
      return method === 'ensureDatabase' && families.has(MIKRO_ORM) && ensuresSchema(call);
    }

    function syncsModels(object) {
      return (
        families.has(SEQUELIZE) &&
        !hasKey(context, object, 'synchronize') &&
        !hasOpaqueSpread(context, object)
      );
    }

    return {
      Property(node) {
        const key = propertyKey(node);
        const object = node.parent;
        const ormOptions =
          families.has(TYPEORM) || families.has(SEQUELIZE) || isTypeOrmShaped(context, object);
        if (SYNC_KEYS.has(key) && ormOptions && isSwitchedOn(context, node.value)) {
          report(node, `${key}: true`);
        }
        if (key === 'autoLoadModels' && isSwitchedOn(context, node.value) && syncsModels(object)) {
          report(node, 'autoLoadModels: true` without `synchronize: false');
        }
      },
      CallExpression(node) {
        const callee = unwrapped(node.callee);
        const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
        if (method === undefined || isForeign(callee.object)) {
          return;
        }
        if (isSchemaCall(node, method, callee.object)) {
          report(node, callForm(context, callee.object, method));
        }
      },
    };
  },
};
