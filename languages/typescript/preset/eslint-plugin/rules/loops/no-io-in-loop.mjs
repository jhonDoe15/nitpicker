import { wordsOf } from '../../../../../../shared/naming/secret-words.mjs';
import { isPushedForConcurrency } from './concurrent-batches.mjs';
import { enclosingLoop, isPagingLoop, isRetryAttempt } from './loop-shapes.mjs';

const BUILT_IN_MODULES = /^(?:node:)?(?:http|https|http2|net|dns|child_process)$/;
const PACKAGE_MODULES = new RegExp(
  `^(?:${[
    'axios',
    'got',
    'undici',
    'node-fetch',
    'ky',
    'superagent',
    'pg',
    'mysql2?',
    'mongodb',
    'mongoose',
    'redis',
    'ioredis',
    'typeorm',
    'knex',
    'sequelize',
    'drizzle-orm',
    'better-sqlite3',
    'sqlite3?',
    '@prisma\\/client',
    '@aws-sdk\\/.+',
  ].join('|')})$`,
);
const OWNER_WORDS = new Set([
  'repo',
  'repository',
  'dao',
  'db',
  'database',
  'prisma',
  'client',
  'pool',
  'connection',
  'knex',
  'redis',
  'http',
  'axios',
  'api',
  'gateway',
]);
const METHOD_PREFIXES = new Set([
  'find',
  'fetch',
  'load',
  'read',
  'query',
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'remove',
  'save',
  'create',
  'count',
  'execute',
  'write',
  'list',
]);
const GETTER_LOOKUPS = new Set(['by', 'all', 'many', 'one', 'page']);
const METHOD_NAMES = new Set([
  'exists',
  'exec',
  'send',
  'post',
  'put',
  'patch',
  'request',
  'raw',
  'run',
]);

function isInputOutputMethod(name) {
  const [first, second] = wordsOf(name);
  if (first === 'get') {
    return second === undefined || GETTER_LOOKUPS.has(second);
  }
  return METHOD_NAMES.has(name) || METHOD_PREFIXES.has(first);
}

function isInputOutputOwner(name) {
  return OWNER_WORDS.has(wordsOf(name).at(-1));
}

function inputOutputModule(name) {
  return BUILT_IN_MODULES.test(name) || PACKAGE_MODULES.test(name);
}

function chainStep(node) {
  if (node.type === 'Identifier') {
    return { name: node.name };
  }
  if (node.type === 'MemberExpression') {
    return { name: node.computed ? undefined : node.property.name, next: node.object };
  }
  if (node.type === 'CallExpression') {
    return { next: node.callee };
  }
  return node.type === 'AwaitExpression' ? { next: node.argument } : {};
}

function chainNames(start) {
  const names = [];
  const pending = [start];
  for (const node of pending) {
    const { name, next } = chainStep(node);
    if (name !== undefined) {
      names.unshift(name);
    }
    if (next !== undefined) {
      pending.push(next);
    }
  }
  return names;
}

function isInputOutputCall(call, importedNames) {
  const names = chainNames(call.callee);
  if (names.length === 0) {
    return false;
  }
  if (names[0] === 'fetch' || importedNames.has(names[0])) {
    return true;
  }
  const owners = names.slice(0, -1);
  return owners.length > 0 && isInputOutputMethod(names.at(-1)) && owners.some(isInputOutputOwner);
}

function importedInputOutputNames(program) {
  return new Set(
    program.body
      .filter(
        (statement) =>
          statement.type === 'ImportDeclaration' &&
          statement.importKind !== 'type' &&
          inputOutputModule(statement.source.value),
      )
      .flatMap((statement) => statement.specifiers.map(({ local }) => local.name)),
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not call a database, HTTP or repository API once per loop item',
    },
    schema: [],
    messages: {
      call: [
        'This calls {{callee}} once per item of a loop (one query or request per item).',
        'Batch it: fetch or write all items at once (`findByIds`, `WHERE id IN (...)`, one batched request),',
        'or run the calls together with `Promise.all(items.map(...))` when there is no batch API.',
        'Paging, cursor and retry loops are fine.',
        'An exception fits only when a call per item is intended (an API with no batch form and a rate limit).',
      ].join(' '),
    },
  },
  create(context) {
    let importedNames = new Set();
    return {
      Program(program) {
        importedNames = importedInputOutputNames(program);
      },
      CallExpression(node) {
        const { sourceCode } = context;
        const found = isInputOutputCall(node, importedNames)
          ? enclosingLoop(node, sourceCode)
          : undefined;
        if (found === undefined) {
          return;
        }
        const { visitorKeys } = sourceCode;
        const exempt =
          isRetryAttempt(node, found.loop, visitorKeys) ||
          isPagingLoop(found.loop, visitorKeys) ||
          isPushedForConcurrency(node, sourceCode);
        if (exempt) {
          return;
        }
        const callee = chainNames(node.callee).join('.');
        context.report({ node, messageId: 'call', data: { callee: `${callee}()` } });
      },
    };
  },
};
