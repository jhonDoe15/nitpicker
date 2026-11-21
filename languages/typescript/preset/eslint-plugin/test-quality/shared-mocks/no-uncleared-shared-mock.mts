import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import {
  type RunnerApis,
  createRunnerApis,
  runnerApiVisitors,
} from '../../rules/runner-apis/runner-apis.mts';
import { ancestorsOf, contains } from '../../rules/typed/node-views.mts';
import { callbackOwner, chainHasProperty, testCallback } from '../test-calls.mts';
import {
  FUNCTION_TYPES,
  declaredMocks,
  isSharedLevel,
  type Context,
  type Shared,
} from './declared-mocks.mts';
import {
  type ClearedMock,
  type CountRead,
  clearedMock,
  clearsEveryMock,
  countRead,
  mockedModule,
  resetCallFor,
} from './mock-sites.mts';

type TestCall = { readonly call: TSESTree.CallExpression; readonly body: TSESTree.Node };
type Clear = ClearedMock & { readonly node: TSESTree.Node };
type Container = TSESTree.Program | TSESTree.BlockStatement;
type State = {
  readonly context: Context;
  readonly apis: RunnerApis;
  readonly shared: Shared[];
  readonly tests: TestCall[];
  readonly reads: CountRead[];
  readonly cleared: Set<string>;
  readonly clears: Clear[];
  readonly mockedSources: Map<string, string | undefined>;
  readonly imports: TSESTree.ImportDeclaration[];
  clearsAll: boolean;
};

const SHARED_SETUP_HOOKS = new Set(['beforeEach', 'beforeAll']);
const REPEATED_CASES = ['each', 'for'];
const REPEATED_WEIGHT = 2;

function hookCall(node: TSESTree.Node): TSESTree.CallExpression | undefined {
  const owner = FUNCTION_TYPES.has(node.type) ? callbackOwner(node) : undefined;
  return owner?.callee.type === AST_NODE_TYPES.Identifier &&
    SHARED_SETUP_HOOKS.has(owner.callee.name)
    ? owner
    : undefined;
}

function weightOf(test: TestCall): number {
  if (!REPEATED_CASES.some((name) => chainHasProperty(test.call.callee, name))) {
    return 1;
  }
  const cases =
    test.call.callee.type === AST_NODE_TYPES.CallExpression
      ? test.call.callee.arguments[0]
      : undefined;
  return cases?.type === AST_NODE_TYPES.ArrayExpression
    ? Math.min(cases.elements.length, REPEATED_WEIGHT)
    : REPEATED_WEIGHT;
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
    .some((token) => token.type === AST_TOKEN_TYPES.Identifier && token.value === name);
}

function enclosingTests({ context, tests }: State, node: TSESTree.Node): TestCall[] {
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
    : tests.filter((test) => callsNamed(test, context.sourceCode, helper));
}

function report(state: State, { variable, node, kind }: Shared): void {
  const { context, reads, tests } = state;
  const references = variable.references.filter((reference) => !reference.init);
  if (references.some((reference) => reference.isWrite()) || state.cleared.has(variable.name)) {
    return;
  }
  const using = new Set(
    references.flatMap((reference) => enclosingTests(state, reference.identifier)),
  );
  const weight = [...using].reduce((total, test) => total + weightOf(test), 0);
  const read = reads.find(
    (each) =>
      references.some((reference) => contains(each.node, reference.identifier)) &&
      tests.some((test) => contains(test.body, each.node)),
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

function visitCall(state: State, node: TSESTree.CallExpression): void {
  const body = testCallback(state.context, node);
  if (body !== undefined) {
    state.tests.push({ call: node, body });
  }
  const mocked = mockedModule(state.apis, node);
  if (mocked !== undefined) {
    state.mockedSources.set(mocked.source, mocked.kind);
  }
  state.clearsAll ||= clearsEveryMock(state.apis, node);
  const cleared = clearedMock(state.apis, node);
  if (cleared !== undefined) {
    state.clears.push({ ...cleared, node });
  }
}

function importedMocks({ context, imports, mockedSources }: State): Shared[] {
  return imports
    .filter((declaration) => mockedSources.has(declaration.source.value))
    .flatMap((declaration) =>
      context.sourceCode.getDeclaredVariables(declaration).map((variable) => ({
        variable,
        node: variable.defs[0]?.name ?? declaration,
        kind: mockedSources.get(declaration.source.value),
      })),
    );
}

function reportUncleared(state: State): void {
  const candidates = [...state.shared, ...importedMocks(state)];
  const names = new Set(candidates.map(({ variable }) => variable.name));
  for (const { name, node } of state.clears) {
    const inTest = state.tests.some((test) => contains(test.body, node));
    state.clearsAll ||= !inTest && (name === undefined || !names.has(name));
    if (name !== undefined) {
      state.cleared.add(name);
    }
  }
  if (state.clearsAll) {
    return;
  }
  for (const each of candidates) {
    report(state, each);
  }
}

export const rule: TSESLint.RuleModule<'sharedMock'> = {
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
    const state: State = {
      context,
      apis,
      shared: [],
      tests: [],
      reads: [],
      cleared: new Set(),
      clears: [],
      mockedSources: new Map(),
      imports: [],
      clearsAll: false,
    };
    return {
      ...visitors,
      ImportDeclaration(node) {
        visitors.ImportDeclaration(node);
        if (node.importKind !== 'type') {
          state.imports.push(node);
        }
      },
      VariableDeclarator(node) {
        visitors.VariableDeclarator(node);
        if (isSharedLevel(node.parent)) {
          for (const mock of declaredMocks(context, apis, node)) {
            state.shared.push(mock);
          }
        }
      },
      CallExpression(node) {
        visitCall(state, node);
      },
      MemberExpression(node) {
        const read = countRead(apis, node);
        if (read !== undefined) {
          state.reads.push(read);
        }
      },
      'Program:exit'() {
        reportUncleared(state);
      },
    };
  },
};
