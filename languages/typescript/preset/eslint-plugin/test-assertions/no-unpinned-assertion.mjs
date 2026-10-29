import { chainOf } from '../rules/analysis/ancestry.mjs';
import { isExpectCall, memberName } from '../rules/analysis/test-code-analysis.mjs';

const EXCEPTION_ROUTE = 'An exception fits only when the value cannot be pinned.';
const ASSERT_EXACT = '`assert.strictEqual` or `assert.deepStrictEqual`';
const CHAI_EXACT = '`expect(...).to.equal(...)` or `expect(...).to.deep.equal(...)`';
const ASSERT_TRUTHY = new Set(['ok', 'isOk', 'notOk', 'isNotOk']);
const ASSERT_DEFINED = new Set(['exists', 'isNotNull', 'isDefined', 'isNotUndefined']);
const ASSERT_THROWS = new Set(['throws', 'rejects', 'throw', 'Throw']);
const NOT_A_SUBJECT = new Set([...ASSERT_THROWS, 'fail', 'doesNotThrow', 'doesNotReject']);
const VAGUE_ARGUMENTS = new Set(['Identifier', 'MemberExpression']);
const NEGATED_ONLY = new Set(['null', 'undefined']);
const ASSERT_MODULES = new Set(['assert', 'node:assert', 'assert/strict', 'node:assert/strict']);

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') {
    return 'default';
  }
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

function rememberImport(bindings, node) {
  const source = node.source.value;
  for (const specifier of node.specifiers) {
    const name = importedName(specifier);
    if (ASSERT_MODULES.has(source)) {
      bindings.set(specifier.local.name, name === 'default' || name === 'strict' ? 'ok' : name);
    } else if (source === 'chai' && name === 'assert') {
      bindings.set(specifier.local.name, 'ok');
    }
  }
}

function rememberRequire(bindings, declarator) {
  const { id, init } = declarator;
  const isAssertRequire =
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    ASSERT_MODULES.has(init.arguments[0]?.value);
  if (!isAssertRequire) {
    return;
  }
  if (id.type === 'Identifier') {
    bindings.set(id.name, 'ok');
    return;
  }
  for (const property of id.type === 'ObjectPattern' ? id.properties : []) {
    if (property.type === 'Property' && property.value.type === 'Identifier') {
      bindings.set(property.value.name, property.key.name ?? property.key.value);
    }
  }
}

function isAssertNamespace(bindings, node) {
  const target = memberName(node) === 'strict' ? node.object : node;
  if (target.type === 'Identifier') {
    return target.name === 'assert' || bindings.get(target.name) === 'ok';
  }
  return memberName(target) === 'assert';
}

function assertMethod(bindings, callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'assert' ? 'ok' : bindings.get(callee.name);
  }
  return callee.type === 'MemberExpression' && isAssertNamespace(bindings, callee.object)
    ? memberName(callee)
    : undefined;
}

function unwrapped(node) {
  if (node.type === 'TSNonNullExpression' || node.type === 'ChainExpression') {
    return node.expression;
  }
  return node.type === 'UnaryExpression' && node.operator === '!' ? node.argument : undefined;
}

function isVague(argument) {
  const layers = argument === undefined ? [] : chainOf(argument, unwrapped);
  return VAGUE_ARGUMENTS.has(layers.at(-1)?.type);
}

function assertVerdict(bindings, node) {
  const method = assertMethod(bindings, node.callee);
  if (method !== undefined && !NOT_A_SUBJECT.has(method) && node.arguments[0]?.type === 'Literal') {
    return { messageId: 'literalSubject', form: method };
  }
  if (ASSERT_TRUTHY.has(method) && isVague(node.arguments[0])) {
    return { messageId: 'unpinned', form: `assert.${method}`, exact: ASSERT_EXACT };
  }
  if (ASSERT_DEFINED.has(method)) {
    return { messageId: 'unpinned', form: `assert.${method}`, exact: ASSERT_EXACT };
  }
  if (ASSERT_THROWS.has(method) && node.arguments.length < 2) {
    return { messageId: 'unpinnedFailure', form: `assert.${method}` };
  }
  return method === 'called' ? { messageId: 'bareCall', form: 'assert.called' } : undefined;
}

function chaiLinks(node) {
  const chain = chainOf(node, (link) =>
    link.type === 'MemberExpression' ? link.object : undefined,
  );
  return isExpectCall(chain.at(-1)) ? chain.map((link) => memberName(link)) : undefined;
}

function chaiPropertyVerdict(name, links) {
  const negated = links.includes('not');
  if (name === 'ok' || (name === 'exist' && !negated) || (NEGATED_ONLY.has(name) && negated)) {
    return { messageId: 'unpinned', form: `.${negated ? 'not.' : ''}${name}`, exact: CHAI_EXACT };
  }
  if (name === 'rejected' && !negated) {
    return { messageId: 'unpinnedFailure', form: '.rejected' };
  }
  return name === 'called' && !negated ? { messageId: 'bareCall', form: '.called' } : undefined;
}

function isTerminal(node) {
  const { parent } = node;
  return (
    !(parent.type === 'MemberExpression' && parent.object === node) &&
    !(parent.type === 'CallExpression' && parent.callee === node)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require node:assert, Chai and Sinon assertions to pin the value' },
    schema: [],
    messages: {
      unpinned: `\`{{form}}\` passes for many values. Assert the exact value with {{exact}}. ${EXCEPTION_ROUTE}`,
      unpinnedFailure: `\`{{form}}\` without the expected error passes for any failure. Pass the error class or message: \`assert.throws(run, { message: '...' })\`, \`expect(run).to.throw(SpecificError, '...')\` or \`.rejectedWith(SpecificError, '...')\`. ${EXCEPTION_ROUTE}`,
      literalSubject: `A literal passed as the value under test can never fail. Pass the value the code under test returns as the first argument of \`{{form}}\`. ${EXCEPTION_ROUTE}`,
      bareCall: `A bare \`{{form}}\` check passes for a call with any arguments. Assert them with \`calledWith(...)\`: \`sinon.assert.calledWith(spy, ...)\` or \`expect(spy).to.have.been.calledWith(...)\`. An exception fits only when the arguments cannot be pinned.`,
    },
  },
  create(context) {
    const bindings = new Map();
    function reportVerdict(node, verdict) {
      if (verdict !== undefined) {
        const { messageId, ...data } = verdict;
        context.report({ node, messageId, data });
      }
    }
    return {
      ImportDeclaration(node) {
        rememberImport(bindings, node);
      },
      VariableDeclarator(node) {
        rememberRequire(bindings, node);
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type === 'MemberExpression' && !isAssertNamespace(bindings, callee.object)) {
          const links = chaiLinks(callee.object);
          const name = memberName(callee);
          const pinsNothing = ASSERT_THROWS.has(name) && node.arguments.length === 0;
          if (links !== undefined && pinsNothing && !links.includes('not')) {
            reportVerdict(node.callee.property, {
              messageId: 'unpinnedFailure',
              form: `.${name}()`,
            });
          }
          return;
        }
        reportVerdict(node, assertVerdict(bindings, node));
      },
      MemberExpression(node) {
        if (!isTerminal(node)) {
          return;
        }
        const links = chaiLinks(node.object);
        if (links !== undefined) {
          reportVerdict(node.property, chaiPropertyVerdict(memberName(node), links));
        }
      },
    };
  },
};
