import type { TSESLint } from '@typescript-eslint/utils';
import { queryScope } from '../query-calls.mts';
import { suggestible } from '../../../fixes/support/descriptors.mts';
import { existenceFix } from '../../../fixes/queries/existence/existence-fix.mts';
import { COLUMN, EXISTENCE, columnUse, existenceUse } from './column-uses.mts';

const EXCEPTION =
  'An exception fits only when the rows are used elsewhere too or the model has no cheaper query.';

export const rule: TSESLint.RuleModule<
  typeof COLUMN | typeof EXISTENCE | 'selectOneField' | 'useExists',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        'Disallow loading whole rows only to read one column or to test that a row exists',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      [COLUMN]: `These rows are loaded only to read their \`{{field}}\` column. Select the column in the query: select: { {{field}}: true } (TypeORM, Prisma), attributes (Sequelize), fields (MikroORM), or db.select({ {{field}}: table.{{field}} }) (Drizzle). ${EXCEPTION}`,
      [EXISTENCE]: `This loads or counts rows only to test whether one exists. Ask the database for existence: exists or existsBy (TypeORM), findFirst({ where, select: { id: true } }) (Prisma), findOne with attributes: ['id'] (Sequelize), findOne with fields (MikroORM). ${EXCEPTION}`,
      selectOneField: 'Select only the {{field}} field so the row is not loaded in full.',
      useExists: 'Ask the database whether a row exists with exists or existsBy.',
    },
  },
  create(context) {
    const scope = queryScope(context);
    return {
      AwaitExpression(node) {
        const found = columnUse(context, scope, node) ?? existenceUse(context, scope, node);
        if (found !== undefined) {
          const suggestion =
            found.existence === undefined
              ? undefined
              : existenceFix(context, found.existence, found.node);
          context.report(
            suggestible(
              { node: found.node, messageId: found.shape, data: { field: found.field ?? '' } },
              suggestion ?? { messageId: 'useExists', plan: undefined },
            ),
          );
        }
      },
    };
  },
};
