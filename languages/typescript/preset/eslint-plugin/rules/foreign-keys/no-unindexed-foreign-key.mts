import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { unindexedTableKeys } from './drizzle-tables.mts';
import { unindexedRelations } from './entity-relations.mts';
import { indexesItself, schemaSource } from './schema-source.mts';

type MessageId = 'TypeORM' | 'MikroORM' | 'Drizzle';
type Finding = {
  readonly node: TSESTree.Node;
  readonly orm: MessageId;
  readonly property: string;
  readonly columns?: string;
};

const DRIZZLE = 'Drizzle';
const WHY =
  'Only MySQL indexes a foreign-key column by itself; PostgreSQL, SQL Server and SQLite do not, so every delete of a referenced row, and every join or lookup by the column, scans the whole table once it grows.';
const EXCEPTION = 'An exception fits only when the table is known to stay small.';

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a many-to-one relation or a Drizzle foreign key with no index that starts with its column, when the schema is not built from migrations',
    },
    schema: [],
    messages: {
      TypeORM: `The many-to-one relation {{property}} has no index on its join column. Add @Index() to the relation, or a class @Index whose first column is it. ${WHY} ${EXCEPTION}`,
      MikroORM: `The many-to-one relation {{property}} has no index on its foreign-key column. Add index: true to @ManyToOne, @Index() or @Unique() on the property, or a class @Index or @Unique whose first property is it. ${WHY} ${EXCEPTION}`,
      Drizzle: `The foreign key on {{property}} has no index that starts with it. Add index().on({{columns}}) to the table's extra config, or .unique() on a single column. ${WHY} ${EXCEPTION}`,
    },
  },
  create(context) {
    const { sourceCode } = context;
    const found: Finding[] = [];

    function collect(entries: readonly Finding[]): void {
      found.push(...entries);
    }

    return {
      'ClassDeclaration, ClassExpression'(
        node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      ) {
        collect(unindexedRelations(sourceCode, node));
      },
      CallExpression(node) {
        collect(
          unindexedTableKeys(sourceCode, node).map((key) => ({
            node: key.node,
            orm: DRIZZLE,
            property: key.columns.join(', '),
            columns: key.columns.map((column) => `table.${column}`).join(', '),
          })),
        );
      },
      'Program:exit'() {
        const source = found.length === 0 ? undefined : schemaSource(context.filename);
        if (source === undefined || source.fromMigrations) {
          return;
        }
        for (const entry of found.filter(({ orm }) => !indexesItself(source, orm))) {
          context.report({
            node: entry.node,
            messageId: entry.orm,
            data: { property: entry.property, columns: entry.columns ?? '' },
          });
        }
      },
    };
  },
};
