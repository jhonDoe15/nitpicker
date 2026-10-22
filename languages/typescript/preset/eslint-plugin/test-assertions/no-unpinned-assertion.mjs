import { chainOf } from '../rules/analysis/ancestry.mjs';
import { isExpectCall, memberName } from '../rules/analysis/test-code-analysis.mjs';

const EXCEPTION_ROUTE = 'An exception fits only when the value cannot be pinned.';
const ASSERT_EXACT = '`assert.strictEqual` or `assert.deepStrictEqual`';
const CHAI_EXACT = '`expect(...).to.equal(...)` or `expect(...).to.deep.equal(...)`';
const ASSERT_TRUTHY = new Set(['ok', 'isOk', 'notOk', 'isNotOk']);
const ASSERT_DEFINED = new Set(['exists', 'isNotNull', 'isDefined', 'isNotUndefined']);
const ASSERT_THROWS = new Set(['throws', 'rejects', 'throw', 'Throw']);
const VAGUE_ARGUMENTS = new Set(['Identifier', 'MemberExpression']);
const NEGATED_ONLY = new Set(['null', 'undefined']);

function isAssertNamespace(node) {
  return (node.type === 'Identifier' && node.name === 'assert') || memberName(node) === 'assert';
}

function assertMethod(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'assert' ? 'ok' : undefined;
  }
  return callee.type === 'MemberExpression' && isAssertNamespace(callee.object)
    ? memberName(callee)
    : undefined;
}

function assertVerdict(node) {
  const method = assertMethod(node.callee);
  if (ASSERT_TRUTHY.has(method) && VAGUE_ARGUMENTS.has(node.arguments[0]?.type)) {
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
  if (name === 'rejected') {
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
      bareCall: `A bare \`{{form}}\` check passes for a call with any arguments. Assert them with \`calledWith(...)\`: \`sinon.assert.calledWith(spy, ...)\` or \`expect(spy).to.have.been.calledWith(...)\`. An exception fits only when the arguments cannot be pinned.`,
    },
  },
  create(context) {
    function reportVerdict(node, verdict) {
      if (verdict !== undefined) {
        const { messageId, ...data } = verdict;
        context.report({ node, messageId, data });
      }
    }
    return {
      CallExpression(node) {
        if (node.callee.type === 'MemberExpression' && !isAssertNamespace(node.callee.object)) {
          const links = chaiLinks(node.callee.object);
          const name = memberName(node.callee);
          if (links !== undefined && ASSERT_THROWS.has(name) && node.arguments.length === 0) {
            reportVerdict(node.callee.property, {
              messageId: 'unpinnedFailure',
              form: `.${name}()`,
            });
          }
          return;
        }
        reportVerdict(node, assertVerdict(node));
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
