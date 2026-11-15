import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { ancestorsOf } from '../../typed/node-views.mts';
import { bindingsOf, importedFunction } from '../imported-names.mts';
import { type Context } from '../security-values.mts';
import { compositionKind, hasRuntimeValue, looksLikeSql, piecesOf } from './sql-composition.mts';
import { classify, type Piece } from './sql-inert.mts';
import { sinkFor, variableSink, type Sink } from './sql-sinks.mts';

type Options = readonly [Readonly<Record<string, unknown>>?];
type Composition = TSESTree.BinaryExpression | TSESTree.TemplateLiteral | TSESTree.CallExpression;

const FORMAT_MODULES = new Set(['util', 'node:util', 'sprintf-js']);
const FORMAT_FUNCTIONS = new Set<string | undefined>(['format', 'sprintf']);
const COMPOSITION_TYPES = new Set<string>([
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.CallExpression,
]);
const EXAMPLE = 'SELECT * FROM users WHERE id = ${id}';
const TAGGED_TEMPLATES = new Map([
  ['@prisma/client', `\`prisma.$queryRaw\`${EXAMPLE}\`\` (Prisma)`],
  ['drizzle-orm', `\`sql\`${EXAMPLE}\`\` from drizzle-orm`],
  ['kysely', `\`sql\`${EXAMPLE}\`\` from kysely`],
  ['postgres', `\`sql\`${EXAMPLE}\`\` (postgres)`],
  ['slonik', `\`sql.unsafe\`${EXAMPLE}\`\` from slonik`],
  ['@databases/pg', `\`sql\`${EXAMPLE}\`\` from @databases/pg`],
  ['sql-template-strings', `\`SQL\`${EXAMPLE}\`\` from sql-template-strings`],
]);
const ANY_TAGGED_TEMPLATE =
  'a tagged template where the driver has one (`sql`... ${id}`` in drizzle-orm, kysely or postgres, `prisma.$queryRaw`...``), or ';

export const SQL_LIBRARIES = [...TAGGED_TEMPLATES.keys()];

export function taggedForm(library: string | undefined): string {
  const form = library === undefined ? undefined : TAGGED_TEMPLATES.get(library);
  return form === undefined ? ANY_TAGGED_TEMPLATE : `${form}, or `;
}

function initialPieces(
  context: Context,
  identifier: TSESTree.Identifier,
  isFormatCall: (call: TSESTree.CallExpression) => boolean,
): Piece[] {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const init =
    definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node.init : undefined;
  if (init === undefined || init === null) {
    return [];
  }
  return piecesOf(context, init, isFormatCall) ?? [classify(context, init)];
}

function isComposition(node: TSESTree.Node): boolean {
  return (
    COMPOSITION_TYPES.has(node.type) &&
    node.parent?.type !== AST_NODE_TYPES.TaggedTemplateExpression
  );
}

export const rule: TSESLint.RuleModule<'sqlBuilt', Options> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow SQL text built from runtime values' },
    schema: [
      {
        type: 'object',
        properties: { sqlLibrary: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      sqlBuilt:
        'SQL text built by {{kind}} lets a runtime value change the statement (SQL injection). Use {{tagged}}bind parameters: `pool.query("SELECT * FROM users WHERE id = $1", [id])` (pg), `?` with an array (mysql2, sqlite, knex.raw, knex.whereRaw), `:name` (sequelize, typeorm `.where("user.id = :id", { id })`). Placeholder lists are built from placeholders alone: `ids.map(() => "?").join(",")`, rows as `rows.map(() => "(?, ?)").join(", ")`, `$${i + 1}`, and optional filters as `conditions.push("name = ?")` joined with `" AND "`. A table or column name comes from a fixed lookup (`const COLUMNS = { name: "name" } as const; COLUMNS[key]`) or a value typed as a union of literal names (`table: "users" | "orders"`). An exception fits only when the value is trusted and cannot be written that way.',
    },
  },
  create(context) {
    const reported = new Set<TSESTree.Node>();
    const library = context.options[0]?.['sqlLibrary'];
    const tagged = taggedForm(typeof library === 'string' ? library : undefined);
    const formatters = bindingsOf(context.sourceCode.ast, FORMAT_MODULES);

    function isFormatCall(call: TSESTree.CallExpression): boolean {
      return FORMAT_FUNCTIONS.has(importedFunction(context, call.callee, formatters));
    }

    function check(node: TSESTree.Node, pieces: Piece[] | undefined, sink: Sink | undefined): void {
      const covered = ancestorsOf(node).some((owner) => reported.has(owner));
      if (
        !covered &&
        pieces !== undefined &&
        hasRuntimeValue(pieces) &&
        looksLikeSql(pieces, sink)
      ) {
        reported.add(node);
        context.report({
          node,
          messageId: 'sqlBuilt',
          data: { kind: compositionKind(node), tagged },
        });
      }
    }

    function checkComposition(node: Composition): void {
      const joined =
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.parent.type === AST_NODE_TYPES.BinaryExpression &&
        node.parent.operator === '+';
      if (isComposition(node) && !joined) {
        check(node, piecesOf(context, node, isFormatCall), sinkFor(context, node));
      }
    }

    return {
      BinaryExpression: checkComposition,
      TemplateLiteral: checkComposition,
      CallExpression: checkComposition,
      AssignmentExpression(node) {
        if (node.operator === '+=' && node.left.type === AST_NODE_TYPES.Identifier) {
          const pieces = [
            ...initialPieces(context, node.left, isFormatCall),
            classify(context, node.right),
          ];
          const variable = findVariable(context, node.left, node.left.name);
          check(node, pieces, variableSink(context, variable));
        }
      },
    };
  },
};
