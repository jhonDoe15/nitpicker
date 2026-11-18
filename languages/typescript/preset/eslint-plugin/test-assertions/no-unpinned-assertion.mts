import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../rules/typed/node-views.mts';
import { isExpectCall, memberName } from '../rules/analysis/test-code-analysis.mts';

type MessageId = 'unpinned' | 'unpinnedFailure' | 'literalSubject' | 'bareCall';
type Verdict = {
  readonly messageId: MessageId;
  readonly form: string;
  readonly exact?: string;
};
type Bindings = Map<string, string>;

const UNPINNED_FAILURE = 'unpinnedFailure';
const UNPINNED = 'unpinned';
const ASSERT = 'assert';

const EXCEPTION_ROUTE = 'An exception fits only when the value cannot be pinned.';
const ASSERT_EXACT = '`assert.strictEqual` or `assert.deepStrictEqual`';
const CHAI_EXACT = '`expect(...).to.equal(...)` or `expect(...).to.deep.equal(...)`';
const ASSERT_TRUTHY = new Set(['ok', 'isOk', 'notOk', 'isNotOk']);
const ASSERT_DEFINED = new Set(['exists', 'isNotNull', 'isDefined', 'isNotUndefined']);
const ASSERT_THROWS = new Set(['throws', 'rejects', 'throw', 'Throw']);
const NOT_A_SUBJECT = new Set([...ASSERT_THROWS, 'fail', 'doesNotThrow', 'doesNotReject']);
const VAGUE_ARGUMENTS = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
]);
const NEGATED_ONLY = new Set(['null', 'undefined']);
const ASSERT_MODULES = new Set([ASSERT, 'node:assert', 'assert/strict', 'node:assert/strict']);

function importedName(specifier: TSESTree.ImportDeclaration['specifiers'][number]): string {
  if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
    return 'default';
  }
  return specifier.imported.type === AST_NODE_TYPES.Identifier
    ? specifier.imported.name
    : specifier.imported.value;
}

function rememberImport(bindings: Bindings, node: TSESTree.ImportDeclaration): void {
  const source = node.source.value;
  for (const specifier of node.specifiers) {
    const name = importedName(specifier);
    if (ASSERT_MODULES.has(source)) {
      bindings.set(specifier.local.name, name === 'default' || name === 'strict' ? 'ok' : name);
    } else if (source === 'chai' && name === ASSERT) {
      bindings.set(specifier.local.name, 'ok');
    }
  }
}

function requiredModule(init: TSESTree.Expression | null): string | undefined {
  if (
    init?.type !== AST_NODE_TYPES.CallExpression ||
    init.callee.type !== AST_NODE_TYPES.Identifier ||
    init.callee.name !== 'require'
  ) {
    return undefined;
  }
  const [first] = init.arguments;
  return first?.type === AST_NODE_TYPES.Literal && typeof first.value === 'string'
    ? first.value
    : undefined;
}

function propertyKey(key: TSESTree.PropertyName): string | undefined {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal ? String(key.value) : undefined;
}

function rememberRequire(bindings: Bindings, declarator: TSESTree.VariableDeclarator): void {
  const { id, init } = declarator;
  if (!ASSERT_MODULES.has(requiredModule(init) ?? '')) {
    return;
  }
  if (id.type === AST_NODE_TYPES.Identifier) {
    bindings.set(id.name, 'ok');
    return;
  }
  for (const property of id.type === AST_NODE_TYPES.ObjectPattern ? id.properties : []) {
    const key = property.type === AST_NODE_TYPES.Property ? propertyKey(property.key) : undefined;
    if (
      property.type === AST_NODE_TYPES.Property &&
      property.value.type === AST_NODE_TYPES.Identifier &&
      key !== undefined
    ) {
      bindings.set(property.value.name, key);
    }
  }
}

function isAssertNamespace(bindings: Bindings, node: TSESTree.Node): boolean {
  const target =
    node.type === AST_NODE_TYPES.MemberExpression && memberName(node) === 'strict'
      ? node.object
      : node;
  if (target.type === AST_NODE_TYPES.Identifier) {
    return target.name === ASSERT || bindings.get(target.name) === 'ok';
  }
  return memberName(target) === ASSERT;
}

function assertMethod(bindings: Bindings, callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === ASSERT ? 'ok' : bindings.get(callee.name);
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && isAssertNamespace(bindings, callee.object)
    ? memberName(callee)
    : undefined;
}

function unwrapped(node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
  ) {
    return node.expression;
  }
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!'
    ? node.argument
    : undefined;
}

function isVague(argument: TSESTree.Node | undefined): boolean {
  const layers = argument === undefined ? [] : chainOf<TSESTree.Node>(argument, unwrapped);
  return VAGUE_ARGUMENTS.has(layers.at(-1)?.type ?? '');
}

function assertVerdict(bindings: Bindings, node: TSESTree.CallExpression): Verdict | undefined {
  const method = assertMethod(bindings, node.callee);
  if (method === undefined) {
    return undefined;
  }
  if (!NOT_A_SUBJECT.has(method) && node.arguments[0]?.type === AST_NODE_TYPES.Literal) {
    return { messageId: 'literalSubject', form: method };
  }
  if (ASSERT_TRUTHY.has(method) && isVague(node.arguments[0])) {
    return { messageId: UNPINNED, form: `assert.${method}`, exact: ASSERT_EXACT };
  }
  if (ASSERT_DEFINED.has(method)) {
    return { messageId: UNPINNED, form: `assert.${method}`, exact: ASSERT_EXACT };
  }
  if (ASSERT_THROWS.has(method) && node.arguments.length < 2) {
    return { messageId: UNPINNED_FAILURE, form: `assert.${method}` };
  }
  return method === 'called' ? { messageId: 'bareCall', form: 'assert.called' } : undefined;
}

function chaiLinks(node: TSESTree.Node): (string | undefined)[] | undefined {
  const chain = chainOf<TSESTree.Node>(node, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
  return isExpectCall(chain.at(-1)) ? chain.map((link) => memberName(link)) : undefined;
}

function chaiPropertyVerdict(
  name: string | undefined,
  links: readonly (string | undefined)[],
): Verdict | undefined {
  const negated = links.includes('not');
  if (
    name === 'ok' ||
    (name === 'exist' && !negated) ||
    (name !== undefined && NEGATED_ONLY.has(name) && negated)
  ) {
    return {
      messageId: UNPINNED,
      form: `.${negated ? 'not.' : ''}${name}`,
      exact: CHAI_EXACT,
    };
  }
  if (name === 'rejected' && !negated) {
    return { messageId: UNPINNED_FAILURE, form: '.rejected' };
  }
  return name === 'called' && !negated ? { messageId: 'bareCall', form: '.called' } : undefined;
}

function isTerminal(node: TSESTree.MemberExpression): boolean {
  const { parent } = node;
  return !(
    (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node) ||
    (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === node)
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
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
    const bindings: Bindings = new Map();
    function reportVerdict(node: TSESTree.Node, verdict: Verdict | undefined): void {
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
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !isAssertNamespace(bindings, callee.object)
        ) {
          const links = chaiLinks(callee.object);
          const name = memberName(callee);
          const pinsNothing =
            name !== undefined && ASSERT_THROWS.has(name) && node.arguments.length === 0;
          if (links !== undefined && pinsNothing && !links.includes('not')) {
            reportVerdict(callee.property, { messageId: UNPINNED_FAILURE, form: `.${name}()` });
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
