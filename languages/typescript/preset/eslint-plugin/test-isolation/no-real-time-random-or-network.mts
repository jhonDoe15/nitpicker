import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../rules/typed/node-views.mts';
import {
  type RunnerApis,
  createRunnerApis,
  runnerApiVisitors,
} from '../rules/runner-apis/runner-apis.mts';
import { setsFakeClock, spiedMember } from '../rules/runner-apis/runner-doubles.mts';
import { RUNNER_OPTION_PROPERTY, vocabularyOf } from '../rules/runner-apis/runner-option.mts';

type Options = readonly [Readonly<Record<string, unknown>>?];
type Binding = { readonly allowed: ReadonlySet<string>; readonly imported: string | undefined };
type Bindings = Map<string, Binding>;
type NetworkContext = { readonly sourceCode: SourceCode; readonly bindings: Bindings };
type MessageId = 'clock' | 'random' | 'network';
type Context = Readonly<TSESLint.RuleContext<MessageId, Options>>;
type FakeState = { fakeClock: boolean; randomSpy: boolean };
type Unfaked = {
  readonly clockCalls: readonly (TSESTree.NewExpression | TSESTree.CallExpression)[];
  readonly randomCalls: readonly TSESTree.CallExpression[];
};

const RANDOM_METHOD = 'random';
const NETWORK_MODULES = new Map([
  ['http', new Set(['request', 'get'])],
  ['https', new Set(['request', 'get'])],
  ['net', new Set(['connect', 'createConnection'])],
]);

function moduleName(source: string): string {
  return source.replace(/^node:/u, '');
}

function isNewDateWithoutArguments(node: TSESTree.NewExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Date' &&
    node.arguments.length === 0
  );
}

function isMemberCall(
  node: TSESTree.CallExpression,
  objectName: string,
  propertyName: string,
): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === objectName &&
    nameOf(callee.property) === propertyName
  );
}

function isRandomSpy(apis: RunnerApis, node: TSESTree.CallExpression): boolean {
  const spied = spiedMember(apis, node);
  return (
    spied?.target.type === AST_NODE_TYPES.Identifier &&
    spied.target.name === 'Math' &&
    spied.property.type === AST_NODE_TYPES.Literal &&
    spied.property.value === RANDOM_METHOD
  );
}

function trackNetworkImport(bindings: Bindings, node: TSESTree.ImportDeclaration): void {
  const allowed = NETWORK_MODULES.get(moduleName(node.source.value));
  if (allowed === undefined) {
    return;
  }
  for (const specifier of node.specifiers) {
    const imported =
      specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : '*';
    bindings.set(specifier.local.name, { allowed, imported });
  }
}

function isGlobalFetch(
  sourceCode: SourceCode,
  callee: TSESTree.Identifier,
  node: TSESTree.Node,
): boolean {
  return (
    callee.name === 'fetch' &&
    sourceCode
      .getScope(node)
      .references.some(
        (reference) =>
          reference.identifier === callee &&
          (reference.resolved === null || reference.resolved.defs.length === 0),
      )
  );
}

function isNetworkCall(
  { sourceCode, bindings }: NetworkContext,
  node: TSESTree.CallExpression,
): boolean {
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const binding = bindings.get(callee.name);
    return (
      isGlobalFetch(sourceCode, callee, node) ||
      (binding?.imported !== undefined && binding.allowed.has(binding.imported))
    );
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const object = nameOf(callee.object);
  const property = nameOf(callee.property);
  const binding = object === undefined ? undefined : bindings.get(object);
  return binding !== undefined && property !== undefined && binding.allowed.has(property);
}

function reportUnfaked(
  context: Context,
  state: FakeState,
  { clockCalls, randomCalls }: Unfaked,
): void {
  const { fakeClock, fixRandom } = vocabularyOf(context);
  const unfaked = [
    ...(state.fakeClock ? [] : clockCalls.map((node) => ({ node, messageId: 'clock' as const }))),
    ...(state.randomSpy ? [] : randomCalls.map((node) => ({ node, messageId: 'random' as const }))),
  ];
  for (const report of unfaked) {
    context.report({ ...report, data: { fakeClock, fixRandom } });
  }
}

export const rule: TSESLint.RuleModule<MessageId, Options> = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep the real clock, randomness and network out of tests' },
    schema: [
      {
        type: 'object',
        properties: { network: { type: 'boolean' }, ...RUNNER_OPTION_PROPERTY },
        additionalProperties: false,
      },
    ],
    messages: {
      clock:
        'The real clock makes the test depend on when it runs. Pass the time in, or fake it with {{fakeClock}}.',
      random:
        'Real randomness makes the test fail on some runs. Pass a seeded or fixed value in, or fix it with {{fixRandom}}.',
      network: 'A unit test must not reach the network. Inject the client and fake it.',
    },
  },
  create(context) {
    const checksNetwork = context.options[0]?.['network'] === true;
    const clockCalls: (TSESTree.NewExpression | TSESTree.CallExpression)[] = [];
    const randomCalls: TSESTree.CallExpression[] = [];
    const state: FakeState = { fakeClock: false, randomSpy: false };
    const networkBindings: Bindings = new Map();
    const network = { sourceCode: context.sourceCode, bindings: networkBindings };
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    return {
      ...visitors,
      ImportDeclaration(node) {
        visitors.ImportDeclaration(node);
        trackNetworkImport(networkBindings, node);
      },
      NewExpression(node) {
        if (isNewDateWithoutArguments(node)) {
          clockCalls.push(node);
        }
        if (
          checksNetwork &&
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'WebSocket'
        ) {
          context.report({ node, messageId: 'network' });
        }
      },
      CallExpression(node) {
        if (isMemberCall(node, 'Date', 'now')) {
          clockCalls.push(node);
        }
        if (isMemberCall(node, 'Math', RANDOM_METHOD)) {
          randomCalls.push(node);
        }
        state.fakeClock ||= setsFakeClock(apis, node);
        state.randomSpy ||= isRandomSpy(apis, node);
        if (checksNetwork && isNetworkCall(network, node)) {
          context.report({ node, messageId: 'network' });
        }
      },
      'Program:exit'() {
        reportUnfaked(context, state, { clockCalls, randomCalls });
      },
    };
  },
};
