const LOOPS = new Set([
  'ForOfStatement',
  'ForInStatement',
  'ForStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const ITERATION_METHODS = new Set([
  'map',
  'forEach',
  'flatMap',
  'filter',
  'reduce',
  'some',
  'every',
  'find',
  'findIndex',
]);
const EXIT_STATEMENT = /\b(?:return|break)\b/;
const BUILT_IN_MODULES = /^(?:node:)?(?:fs|fs\/promises|http|https|http2|net|dns|child_process)$/;
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
const OWNER_WORDS = [
  'repo',
  'repository',
  'dao',
  'db',
  'database',
  'prisma',
  'client',
  'pool',
  'connection',
  'conn',
  'collection',
  'model',
  'orm',
  'knex',
  'redis',
  'http',
  'axios',
  'api',
  'gateway',
];
const INPUT_OUTPUT_OWNER = new RegExp(`(?:${OWNER_WORDS.join('|')})$`, 'i');
const METHOD_PREFIXES = [
  'find',
  'get',
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
];
const METHOD_NAMES = ['exists', 'exec', 'send', 'post', 'put', 'patch', 'request', 'raw', 'run'];
const INPUT_OUTPUT_METHOD = new RegExp(
  `^(?:${METHOD_PREFIXES.map((word) => `${word}\\w*`).join('|')}|${METHOD_NAMES.join('|')})$`,
);

function inputOutputModule(name) {
  return BUILT_IN_MODULES.test(name) || PACKAGE_MODULES.test(name);
}

function chainStep(node) {
  if (node.type === 'Identifier') return { name: node.name };
  if (node.type === 'MemberExpression') {
    return { name: node.computed ? undefined : node.property.name, next: node.object };
  }
  if (node.type === 'CallExpression') return { next: node.callee };
  return node.type === 'AwaitExpression' ? { next: node.argument } : {};
}

function chainNames(start) {
  const names = [];
  const pending = [start];
  for (const node of pending) {
    const { name, next } = chainStep(node);
    if (name !== undefined) names.unshift(name);
    if (next !== undefined) pending.push(next);
  }
  return names;
}

function ancestorsOf(node) {
  const ancestors = [];
  const pending = [node.parent];
  for (const ancestor of pending) {
    if (ancestor) {
      ancestors.push(ancestor);
      pending.push(ancestor.parent);
    }
  }
  return ancestors;
}

function isInputOutputCall(call, importedNames) {
  const names = chainNames(call.callee);
  if (names.length === 0) return false;
  if (names[0] === 'fetch' || importedNames.has(names[0])) return true;
  const owners = names.slice(0, -1);
  return (
    owners.length > 0 &&
    INPUT_OUTPUT_METHOD.test(names.at(-1)) &&
    owners.some((name) => INPUT_OUTPUT_OWNER.test(name))
  );
}

function isIterationCallback(fn) {
  const call = fn.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments.includes(fn) &&
    call.callee.type === 'MemberExpression' &&
    ITERATION_METHODS.has(call.callee.property.name)
  );
}

function isLoopBody(loop, child) {
  return child === loop.body || child === loop.test || child === loop.update;
}

function isInsideLoop(node) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (LOOPS.has(parent.type) && isLoopBody(parent, child)) return true;
    if (FUNCTIONS.has(parent.type)) return isIterationCallback(parent);
    child = parent;
  }
  return false;
}

function isRetryAttempt(call, sourceCode) {
  for (const parent of ancestorsOf(call)) {
    if (FUNCTIONS.has(parent.type)) return false;
    if (parent.type === 'TryStatement' && EXIT_STATEMENT.test(sourceCode.getText(parent.block))) {
      return true;
    }
  }
  return false;
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
      description: 'Do not call a database, HTTP, file or repository API once per loop item',
    },
    schema: [],
    messages: {
      call: [
        'This calls {{callee}} once per item of a loop (one query or request per item).',
        'Fetch or write all items at once (`findByIds`, `WHERE id IN (...)`, one batched request).',
        'If a call per item is intended (for example one file read per source file),',
        'add an exception for nitpicker/no-io-in-loop in nitpicker.config.json.',
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
        const loops = isInputOutputCall(node, importedNames) && isInsideLoop(node);
        if (!loops || isRetryAttempt(node, context.sourceCode)) return;
        const callee = chainNames(node.callee).join('.');
        context.report({ node, messageId: 'call', data: { callee: `${callee}()` } });
      },
    };
  },
};
