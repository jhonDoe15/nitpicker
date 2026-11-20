import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  type RunnerApis,
  createRunnerApis,
  kindOfObject,
  runnerApiVisitors,
} from '../../rules/runner-apis/runner-apis.mts';
import { ancestorsOf, chainOf, contains } from '../../rules/typed/node-views.mts';
import { callbackOwner, chainHasProperty, isSuiteCall, testCallback } from '../test-calls.mts';
import {
  type CountRead,
  clearedMockName,
  clearsEveryMock,
  countRead,
  isMockCreation,
  mockedModule,
  resetCallFor,
} from './mock-sites.mts';

type Context = Readonly<TSESLint.RuleContext<'sharedMock', []>>;
type Variable = TSESLint.Scope.Variable;
type TestCall = { readonly call: TSESTree.CallExpression; readonly body: TSESTree.Node };
type Shared = {
  readonly variable: Variable;
  readonly node: TSESTree.Node;
  readonly kind?: string | undefined;
};
type Container = TSESTree.Program | TSESTree.BlockStatement;

const SHARED_SETUP_HOOKS = new Set(['beforeEach', 'beforeAll']);
const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const REPEATED_CASES = ['each', 'for'];
const REPEATED_WEIGHT = 2;

function suiteBody(parent: TSESTree.Node): parent is TSESTree.BlockStatement {
  const owner = parent.parent;
  const call =
    owner !== undefined && FUNCTION_TYPES.has(owner.type) ? callbackOwner(owner) : undefined;
  return parent.type === AST_NODE_TYPES.BlockStatement && call !== undefined && isSuiteCall(call);
}

function isSharedLevel(declaration: TSESTree.Node): boolean {
  const parent =
    declaration.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
      ? declaration.parent.parent
      : declaration.parent;
  return parent?.type === AST_NODE_TYPES.Program || (parent !== undefined && suiteBody(parent));
}

function hoistedValue(
  apis: RunnerApis,
  init: TSESTree.Expression | null,
): TSESTree.Node | undefined {
  const callback =
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.MemberExpression &&
    kindOfObject(apis, init.callee.object) !== undefined
      ? init.arguments[0]
      : undefined;
  if (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
    return undefined;
  }
  return callback.body.type === AST_NODE_TYPES.ObjectExpression ? callback.body : undefined;
}

function hoistedMocks(apis: RunnerApis, declarator: TSESTree.VariableDeclarator): string[] {
  const value = hoistedValue(apis, declarator.init);
  if (value?.type !== AST_NODE_TYPES.ObjectExpression) {
    return [];
  }
  return value.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property &&
    property.key.type === AST_NODE_TYPES.Identifier &&
    isMockCreation(apis, property.value)
      ? [property.key.name]
      : [],
  );
}

function declaredMocks(
  context: Context,
  apis: RunnerApis,
  node: TSESTree.VariableDeclarator,
): Shared[] {
  const variables = context.sourceCode.getDeclaredVariables(node);
  if (node.id.type === AST_NODE_TYPES.Identifier) {
    const kind = isMockCreation(apis, node.init) ? mockKind(apis, node.init) : undefined;
    return kind === undefined
      ? []
      : variables.map((variable) => ({ variable, node: node.id, kind }));
  }
  const names = new Set(hoistedMocks(apis, node));
  return variables
    .filter((variable) => names.has(variable.name))
    .map((variable) => ({ variable, node: variable.defs[0]?.name ?? node, kind: 'vitest' }));
}

function mockKind(apis: RunnerApis, init: TSESTree.Node | null): string | undefined {
  const callees = chainOf<TSESTree.Node>(init ?? undefined, (current) =>
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression
      ? current.callee.object
      : undefined,
  );
  return callees
    .map((call) =>
      call.type === AST_NODE_TYPES.CallExpression &&
      call.callee.type === AST_NODE_TYPES.MemberExpression
        ? kindOfObject(apis, call.callee.object)
        : undefined,
    )
    .find((kind) => kind !== undefined);
}

function hookCall(node: TSESTree.Node): TSESTree.CallExpression | undefined {
  const owner = FUNCTION_TYPES.has(node.type) ? callbackOwner(node) : undefined;
  return owner?.callee.type === AST_NODE_TYPES.Identifier &&
    SHARED_SETUP_HOOKS.has(owner.callee.name)
    ? owner
    : undefined;
}

function weightOf(test: TestCall): number {
  return REPEATED_CASES.some((name) => chainHasProperty(test.call.callee, name))
    ? REPEATED_WEIGHT
    : 1;
}

function containerOf(call: TSESTree.CallExpression): Container | undefined {
  const parent = call.parent.parent;
  return parent?.type === AST_NODE_TYPES.Program || parent?.type === AST_NODE_TYPES.BlockStatement
    ? parent
    : undefined;
}

function topLevelFunctionName(node: TSESTree.Node): string | undefined {
  const outer = ancestorsOf(node).findLast((ancestor) => FUNCTION_TYPES.has(ancestor.type));
  if (
    outer?.type === AST_NODE_TYPES.FunctionDeclaration &&
    outer.parent.type === AST_NODE_TYPES.Program
  ) {
    return outer.id?.name;
  }
  const holder = outer?.parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator &&
    holder.id.type === AST_NODE_TYPES.Identifier &&
    holder.parent.parent.type === AST_NODE_TYPES.Program
    ? holder.id.name
    : undefined;
}

function callsNamed(test: TestCall, sourceCode: Context['sourceCode'], name: string): boolean {
  return sourceCode
    .getTokens(test.body)
    .some((token) => token.type === 'Identifier' && token.value === name);
}

export const rule: TSESLint.RuleModule<'sharedMock', []> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a mock shared by the tests of a file whose calls are counted and never cleared',
    },
    schema: [],
    messages: {
      sharedMock:
        '`{{name}}` is shared by {{tests}} tests and keeps its calls between them, so `{{form}}` also counts the calls of earlier tests and the result depends on test order. Clear it before each test (`beforeEach(() => { {{reset}}; })`, or `clearMocks: true` in the runner config), or create the mock inside the test.',
    },
  },
  create(context) {
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    const shared: Shared[] = [];
    const tests: TestCall[] = [];
    const reads: CountRead[] = [];
    const cleared = new Set<string>();
    const mockedSources = new Map<string, string | undefined>();
    const imports: TSESTree.ImportDeclaration[] = [];
    const state = { clearsAll: false };
    const { sourceCode } = context;

    function enclosingTests(node: TSESTree.Node): TestCall[] {
      const direct = tests.filter((test) => contains(test.body, node));
      if (direct.length > 0) {
        return direct.slice(-1);
      }
      const hook = ancestorsOf(node)
        .map(hookCall)
        .find((call) => call !== undefined);
      const container = hook === undefined ? undefined : containerOf(hook);
      if (container !== undefined) {
        return tests.filter((test) => contains(container, test.call));
      }
      const helper = topLevelFunctionName(node);
      return helper === undefined
        ? []
        : tests.filter((test) => callsNamed(test, sourceCode, helper));
    }

    function report({ variable, node, kind }: Shared): void {
      const references = variable.references.filter((reference) => !reference.init);
      if (references.some((reference) => reference.isWrite()) || cleared.has(variable.name)) {
        return;
      }
      const using = new Set(
        references.flatMap((reference) => enclosingTests(reference.identifier)),
      );
      const weight = [...using].reduce((total, test) => total + weightOf(test), 0);
      const read = reads.find(
        (each) =>
          each.name === variable.name && tests.some((test) => contains(test.body, each.node)),
      );
      if (weight < 2 || read === undefined) {
        return;
      }
      context.report({
        node,
        messageId: 'sharedMock',
        data: {
          name: variable.name,
          tests: String(weight),
          form: read.form,
          reset: resetCallFor(kind, variable.name),
        },
      });
    }

    return {
      ...visitors,
      ImportDeclaration(node) {
        visitors.ImportDeclaration(node);
        if (node.importKind !== 'type') {
          imports.push(node);
        }
      },
      VariableDeclarator(node) {
        visitors.VariableDeclarator(node);
        if (isSharedLevel(node.parent)) {
          shared.push(...declaredMocks(context, apis, node));
        }
      },
      CallExpression(node) {
        const body = testCallback(context, node);
        if (body !== undefined) {
          tests.push({ call: node, body });
        }
        const mocked = mockedModule(apis, node);
        if (mocked !== undefined) {
          mockedSources.set(mocked.source, mocked.kind);
        }
        state.clearsAll ||= clearsEveryMock(apis, node);
        const name = clearedMockName(apis, node);
        if (name !== undefined) {
          cleared.add(name);
        }
      },
      MemberExpression(node) {
        const read = countRead(apis, node);
        if (read !== undefined) {
          reads.push(read);
        }
      },
      'Program:exit'() {
        if (state.clearsAll) {
          return;
        }
        const imported = imports
          .filter((declaration) => mockedSources.has(declaration.source.value))
          .flatMap((declaration) =>
            sourceCode.getDeclaredVariables(declaration).map((variable) => ({
              variable,
              node: variable.defs[0]?.name ?? declaration,
              kind: mockedSources.get(declaration.source.value),
            })),
          );
        for (const each of [...shared, ...imported]) {
          report(each);
        }
      },
    };
  },
};
