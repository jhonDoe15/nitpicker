import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { findVariable } from '../../analysis/constant-resolution.mjs';
import {
  bindingsOf,
  importedFunction,
  leafValues,
  memberName,
  unwrapped,
} from '../security-values.mjs';
import {
  classify,
  compositionKind,
  hasRuntimeValue,
  looksLikeSql,
  piecesOf,
} from './sql-composition.mjs';

const SQL_CALL_NAME =
  /^(?:\$?(?:query|execute|exec|raw|run|all|get|each|prepare|unsafe|batch)\w*|\w*(?:query|sql|execute)\w*)$/iu;
const FORMAT_MODULES = new Set(['util', 'node:util', 'sprintf-js']);
const FORMAT_FUNCTIONS = new Set(['format', 'sprintf']);
const WRAPPERS = new Set(['Property', 'ObjectExpression', 'ArrayExpression']);
const COMPOSITION_TYPES = new Set(['BinaryExpression', 'TemplateLiteral', 'CallExpression']);

function calleeName(context, callee) {
  const target = unwrapped(callee);
  if (target.type === 'MemberExpression') {
    return memberName(target);
  }
  if (target.type !== 'Identifier') {
    return undefined;
  }
  const alias = leafValues(context, target).find((leaf) => leaf.type === 'MemberExpression');
  return alias === undefined ? target.name : memberName(alias);
}

function isSqlCall(context, call) {
  const name = call.type === 'CallExpression' ? calleeName(context, call.callee) : undefined;
  return name !== undefined && SQL_CALL_NAME.test(name);
}

function consumingCall(node) {
  const owners = ancestorsOf(node);
  const call = owners.find((owner) => !WRAPPERS.has(owner.type));
  return call?.type === 'CallExpression' && call.callee !== node ? call : undefined;
}

function assignedTarget(node) {
  const holder = node.parent;
  if (holder.type === 'VariableDeclarator' && holder.init === node) {
    return holder.id;
  }
  return holder.type === 'AssignmentExpression' && holder.right === node ? holder.left : undefined;
}

function variableOf(context, node) {
  const target = assignedTarget(node);
  return target?.type === 'Identifier' ? findVariable(context, target, target.name) : undefined;
}

function variableReachesSqlCall(context, variable) {
  return (
    variable?.references.some((reference) => {
      const call = consumingCall(reference.identifier);
      return reference.isRead() && call !== undefined && isSqlCall(context, call);
    }) === true
  );
}

function reachesSqlCall(context, node) {
  const direct = consumingCall(node);
  return (
    (direct !== undefined && isSqlCall(context, direct)) ||
    variableReachesSqlCall(context, variableOf(context, node))
  );
}

function initialPieces(context, identifier, isFormatCall) {
  const init = findVariable(context, identifier, identifier.name)?.defs[0]?.node?.init;
  if (init === undefined || init === null) {
    return [];
  }
  return piecesOf(context, init, isFormatCall) ?? [classify(context, init)];
}

function isComposition(node) {
  return COMPOSITION_TYPES.has(node.type) && node.parent?.type !== 'TaggedTemplateExpression';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow SQL text built from runtime values' },
    schema: [],
    messages: {
      sqlBuilt:
        'SQL text built by {{kind}} lets a runtime value change the statement (SQL injection). Pass values as bind parameters: `pool.query("SELECT * FROM users WHERE id = $1", [id])` (pg), `?` with an array (mysql2, sqlite, knex.raw), `:name` (sequelize, typeorm); a list of ids is `ids.map(() => "?").join(",")`; a table or column name comes from a fixed lookup (`const COLUMNS = { name: "name" } as const; COLUMNS[key]`). If the value is trusted and cannot be written that way, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const reported = new Set();
    let formatters = bindingsOf({ body: [] }, FORMAT_MODULES);

    function isFormatCall(call) {
      return FORMAT_FUNCTIONS.has(importedFunction(context, call.callee, formatters));
    }

    function check(node, pieces, inSqlCall) {
      const covered = ancestorsOf(node).some((owner) => reported.has(owner));
      if (!covered && hasRuntimeValue(pieces) && looksLikeSql(pieces, inSqlCall)) {
        reported.add(node);
        context.report({ node, messageId: 'sqlBuilt', data: { kind: compositionKind(node) } });
      }
    }

    return {
      Program(node) {
        formatters = bindingsOf(node, FORMAT_MODULES);
      },
      'BinaryExpression, TemplateLiteral, CallExpression'(node) {
        const joined =
          node.type === 'BinaryExpression' &&
          node.parent.type === 'BinaryExpression' &&
          node.parent.operator === '+';
        if (isComposition(node) && !joined) {
          check(node, piecesOf(context, node, isFormatCall), reachesSqlCall(context, node));
        }
      },
      AssignmentExpression(node) {
        if (node.operator === '+=' && node.left.type === 'Identifier') {
          const pieces = [
            ...initialPieces(context, node.left, isFormatCall),
            classify(context, node.right),
          ];
          const variable = findVariable(context, node.left, node.left.name);
          check(node, pieces, variableReachesSqlCall(context, variable));
        }
      },
    };
  },
};
