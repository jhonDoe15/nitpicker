import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';
import { findVariable } from "../../analysis/constant-resolution.mjs";
import { ancestorsOf } from "../../typed/node-views.mjs";
import { bindingsOf, importedFunction } from "../imported-names.mjs";
import {} from "../security-values.mjs";
import { compositionKind, hasRuntimeValue, looksLikeSql, piecesOf } from "./sql-composition.mjs";
import { classify } from "./sql-inert.mjs";
import { sinkFor, variableSink } from "./sql-sinks.mjs";
const FORMAT_MODULES = new Set(['util', 'node:util', 'sprintf-js']);
const FORMAT_FUNCTIONS = new Set(['format', 'sprintf']);
const COMPOSITION_TYPES = new Set([
    AST_NODE_TYPES.BinaryExpression,
    AST_NODE_TYPES.TemplateLiteral,
    AST_NODE_TYPES.CallExpression,
]);
const EXAMPLE = `SELECT * FROM users WHERE id = \${id}`;
const TAGGED_TEMPLATES = new Map([
    ['@prisma/client', `\`prisma.$queryRaw\`${EXAMPLE}\`\` (Prisma)`],
    ['drizzle-orm', `\`sql\`${EXAMPLE}\`\` from drizzle-orm`],
    ['kysely', `\`sql\`${EXAMPLE}\`\` from kysely`],
    ['postgres', `\`sql\`${EXAMPLE}\`\` (postgres)`],
    ['slonik', `\`sql.unsafe\`${EXAMPLE}\`\` from slonik`],
    ['@databases/pg', `\`sql\`${EXAMPLE}\`\` from @databases/pg`],
    ['sql-template-strings', `\`SQL\`${EXAMPLE}\`\` from sql-template-strings`],
]);
const ANY_TAGGED_TEMPLATE = `a tagged template where the driver has one (\`sql\`... \${id}\`\` in drizzle-orm, kysely or postgres, \`prisma.$queryRaw\`...\`\`), or `;
export const SQL_LIBRARIES = [...TAGGED_TEMPLATES.keys()];
export function taggedForm(library) {
    const form = library === undefined ? undefined : TAGGED_TEMPLATES.get(library);
    return form === undefined ? ANY_TAGGED_TEMPLATE : `${form}, or `;
}
function initialPieces(context, identifier, isFormatCall) {
    const definition = findVariable(context, identifier, identifier.name)?.defs[0];
    const init = definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node.init : undefined;
    if (init === undefined || init === null) {
        return [];
    }
    return piecesOf(context, init, isFormatCall) ?? [classify(context, init)];
}
function isComposition(node) {
    return (COMPOSITION_TYPES.has(node.type) &&
        node.parent?.type !== AST_NODE_TYPES.TaggedTemplateExpression);
}
function isFormatCall({ context, formatters }, call) {
    return FORMAT_FUNCTIONS.has(importedFunction(context, call.callee, formatters));
}
function check({ context, reported, tagged }, node, found) {
    const { pieces, sink } = found;
    const covered = ancestorsOf(node).some((owner) => reported.has(owner));
    if (!covered && pieces !== undefined && hasRuntimeValue(pieces) && looksLikeSql(pieces, sink)) {
        reported.add(node);
        context.report({ node, messageId: 'sqlBuilt', data: { kind: compositionKind(node), tagged } });
    }
}
function checkComposition(state, node) {
    const joined = node.type === AST_NODE_TYPES.BinaryExpression &&
        node.parent.type === AST_NODE_TYPES.BinaryExpression &&
        node.parent.operator === '+';
    if (isComposition(node) && !joined) {
        const { context } = state;
        const pieces = piecesOf(context, node, (call) => isFormatCall(state, call));
        check(state, node, { pieces, sink: sinkFor(context, node) });
    }
}
function checkAppend(state, node) {
    if (node.operator !== '+=' || node.left.type !== AST_NODE_TYPES.Identifier) {
        return;
    }
    const { context } = state;
    const pieces = [
        ...initialPieces(context, node.left, (call) => isFormatCall(state, call)),
        classify(context, node.right),
    ];
    const variable = findVariable(context, node.left, node.left.name);
    check(state, node, { pieces, sink: variableSink(context, variable) });
}
export const rule = {
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
            sqlBuilt: `SQL text built by {{kind}} lets a runtime value change the statement (SQL injection). Use {{tagged}}bind parameters: \`pool.query("SELECT * FROM users WHERE id = $1", [id])\` (pg), \`?\` with an array (mysql2, sqlite, knex.raw, knex.whereRaw), \`:name\` (sequelize, typeorm \`.where("user.id = :id", { id })\`). Placeholder lists are built from placeholders alone: \`ids.map(() => "?").join(",")\`, rows as \`rows.map(() => "(?, ?)").join(", ")\`, \`$\${i + 1}\`, and optional filters as \`conditions.push("name = ?")\` joined with \`" AND "\`. A table or column name comes from a fixed lookup (\`const COLUMNS = { name: "name" } as const; COLUMNS[key]\`) or a value typed as a union of literal names (\`table: "users" | "orders"\`). An exception fits only when the value is trusted and cannot be written that way.`,
        },
    },
    create(context) {
        const library = context.options[0]?.['sqlLibrary'];
        const state = {
            context,
            reported: new Set(),
            tagged: taggedForm(typeof library === 'string' ? library : undefined),
            formatters: bindingsOf(context.sourceCode.ast, FORMAT_MODULES),
        };
        return {
            BinaryExpression(node) {
                checkComposition(state, node);
            },
            TemplateLiteral(node) {
                checkComposition(state, node);
            },
            CallExpression(node) {
                checkComposition(state, node);
            },
            AssignmentExpression(node) {
                checkAppend(state, node);
            },
        };
    },
};
