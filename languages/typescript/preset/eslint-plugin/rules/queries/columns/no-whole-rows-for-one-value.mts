import type { TSESLint } from '@typescript-eslint/utils';
import { queryScope } from '../query-calls.mts';
import { COLUMN, EXISTENCE, columnUse, existenceUse } from './column-uses.mts';

const EXCEPTION =
  'An exception fits only when the rows are used elsewhere too or the model has no cheaper query.';

export const rule: TSESLint.RuleModule<
  typeof COLUMN | typeof EXISTENCE,
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow loading whole rows only to read one column or to test that a row exists',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      [COLUMN]: `These rows are loaded only to read their \`{{field}}\` column. Select the column in the query: select: { {{field}}: true } (TypeORM, Prisma), attributes (Sequelize), fields (MikroORM), or db.select({ {{field}}: table.{{field}} }) (Drizzle). ${EXCEPTION}`,
      [EXISTENCE]: `This loads or counts rows only to test whether one exists. Ask the database for existence: exists or existsBy (TypeORM), findFirst({ where, select: { id: true } }) (Prisma), findOne with attributes: ['id'] (Sequelize), findOne with fields (MikroORM). ${EXCEPTION}`,
    },
  },
  create(context) {
    const scope = queryScope(context);
    return {
      AwaitExpression(node) {
        const found = columnUse(context, scope, node) ?? existenceUse(context, scope, node);
        if (found !== undefined) {
          context.report({
            node: found.node,
            messageId: found.shape,
            data: { field: found.field ?? '' },
          });
        }
      },
    };
  },
};
