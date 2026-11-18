import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  DRIZZLE,
  MIKRO_ORM,
  ormFamilyOf,
  rootName,
  SEQUELIZE,
  TYPEORM,
  type ModuleScope,
} from '../../rules/database/orm-modules.mts';
import { unwrapped } from '../../rules/security/security-values.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';

export const PRISMA = 'prisma';

type Family = typeof TYPEORM | typeof SEQUELIZE | typeof MIKRO_ORM | typeof DRIZZLE | typeof PRISMA;

const IMPORTED = new Map<string, Family>([
  ['DataSource', TYPEORM],
  ['createConnection', TYPEORM],
  ['TypeOrmModule', TYPEORM],
  ['Sequelize', SEQUELIZE],
  ['SequelizeModule', SEQUELIZE],
  ['MikroORM', MIKRO_ORM],
  ['defineConfig', MIKRO_ORM],
  ['MikroOrmModule', MIKRO_ORM],
  ['drizzle', DRIZZLE],
  ['PrismaClient', PRISMA],
]);

export function boundFamily(scope: ModuleScope, callee: TSESTree.Node): Family | undefined {
  const name = rootName(callee);
  const binding = name === undefined ? undefined : scope.bindings.get(name);
  const family = binding?.imported === undefined ? undefined : IMPORTED.get(binding.imported);
  const source = binding?.source ?? '';
  const fromPackage =
    family === PRISMA ? source.startsWith('@prisma/') : ormFamilyOf(source) === family;
  return fromPackage ? family : undefined;
}

function superClassOf(node: TSESTree.Node): TSESTree.Node | undefined {
  const owner = ancestorsOf(node).find(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.ClassDeclaration ||
      ancestor.type === AST_NODE_TYPES.ClassExpression,
  );
  return owner?.type === AST_NODE_TYPES.ClassDeclaration ||
    owner?.type === AST_NODE_TYPES.ClassExpression
    ? (owner.superClass ?? undefined)
    : undefined;
}

export function optionsFamily(
  scope: ModuleScope,
  object: TSESTree.ObjectExpression,
): Family | undefined {
  const call = object.parent;
  if (call.type === AST_NODE_TYPES.NewExpression || call.type === AST_NODE_TYPES.CallExpression) {
    if (!call.arguments.includes(object)) {
      return undefined;
    }
    if (call.callee.type === AST_NODE_TYPES.Super) {
      const parent = superClassOf(call);
      return parent === undefined ? undefined : boundFamily(scope, unwrapped(parent));
    }
    return boundFamily(scope, unwrapped(call.callee));
  }
  return undefined;
}
