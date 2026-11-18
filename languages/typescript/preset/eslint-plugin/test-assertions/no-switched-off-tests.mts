import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../rules/typed/node-views.mts';
import {
  callbackOf,
  isCaseCall,
  isSuiteCall,
  isTestFunctionChain,
} from '../test-quality/test-calls.mts';
import { isLiteralCondition } from './literal-condition.mts';

type Callback = NonNullable<ReturnType<typeof callbackOf>>;
type ContextNames = {
  readonly context: string | undefined;
  readonly destructured: ReadonlySet<string>;
};

const CONDITIONAL_SKIPS = new Set(['skipIf', 'runIf']);
const TOKEN_MESSAGES = new Map<string, 'todo'>([['todo', 'todo']]);
const SWITCH_OFF_OPTIONS = new Set(['skip', 'todo']);
const SWITCH_OFF_CALLS = new Set(['skip', 'todo']);

function isFixedSwitchOff(value: TSESTree.Node): boolean {
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions.length === 0;
  }
  return value.type === AST_NODE_TYPES.Literal && Boolean(value.value);
}

function isReason(argument: TSESTree.Node | undefined): boolean {
  return (
    argument === undefined ||
    (argument.type === AST_NODE_TYPES.Literal && typeof argument.value === 'string') ||
    argument.type === AST_NODE_TYPES.TemplateLiteral
  );
}

function isSubtestCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    nameOf(callee.property) === 'test' &&
    callbackOf(node) !== undefined
  );
}

function propertyKey(property: TSESTree.Property): string | undefined {
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Literal) {
    return String(key.value);
  }
  return nameOf(key);
}

function switchedOffOption(call: TSESTree.CallExpression): TSESTree.Property | undefined {
  return call.arguments
    .filter((argument) => argument.type === AST_NODE_TYPES.ObjectExpression)
    .flatMap((options) => options.properties)
    .filter((property) => property.type === AST_NODE_TYPES.Property)
    .find(
      (property) =>
        !property.computed &&
        SWITCH_OFF_OPTIONS.has(propertyKey(property) ?? '') &&
        isFixedSwitchOff(property.value),
    );
}

function contextNames(callback: Callback): ContextNames {
  const [first] = callback.params;
  if (first?.type === AST_NODE_TYPES.Identifier) {
    return { context: first.name, destructured: new Set() };
  }
  const destructured = (first?.type === AST_NODE_TYPES.ObjectPattern ? first.properties : [])
    .filter((property) => property.type === AST_NODE_TYPES.Property)
    .filter((property) => SWITCH_OFF_CALLS.has(propertyKey(property) ?? ''))
    .map((property) => property.value)
    .filter((value) => value.type === AST_NODE_TYPES.Identifier)
    .map((value) => value.name);
  return { context: undefined, destructured: new Set(destructured) };
}

function isSwitchOffCall(statement: TSESTree.Statement, names: ContextNames): boolean {
  const expression =
    statement.type === AST_NODE_TYPES.ExpressionStatement ? statement.expression : undefined;
  const call = expression?.type === AST_NODE_TYPES.CallExpression ? expression : undefined;
  if (call === undefined || !isReason(call.arguments[0])) {
    return false;
  }
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return names.destructured.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    SWITCH_OFF_CALLS.has(nameOf(callee.property) ?? '') &&
    (callee.object.type === AST_NODE_TYPES.ThisExpression ||
      (callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === names.context))
  );
}

function bodySwitchOff(call: TSESTree.CallExpression): TSESTree.Statement | undefined {
  const callback = callbackOf(call);
  if (callback?.body.type !== AST_NODE_TYPES.BlockStatement) {
    return undefined;
  }
  const names = contextNames(callback);
  return callback.body.body.find((statement) => isSwitchOffCall(statement, names));
}

export const rule: TSESLint.RuleModule<
  'todo' | 'literalCondition' | 'fixedOption' | 'unconditionalSkip'
> = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban test forms that switch a test off' },
    schema: [],
    messages: {
      todo: 'Do not leave a `todo` test: write the test, or delete the stub.',
      literalCondition:
        'A literal condition switches the test off for good. Delete the test or make it run; a real platform condition such as `process.platform === "win32"` is allowed.',
      fixedOption:
        'A fixed `skip` or `todo` option switches the test off for good. Delete the test or make it run; a real condition such as `{ skip: process.platform === "win32" }` is allowed.',
      unconditionalSkip:
        'An unconditional `skip()` or `todo()` in the test body switches the test off for good. Delete the test or make it run; a skip under a real condition such as `if (process.platform === "win32") { t.skip(); }` is allowed.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || !isTestFunctionChain(node.object)) {
          return;
        }
        const messageId = TOKEN_MESSAGES.get(nameOf(node.property) ?? '');
        if (messageId !== undefined) {
          context.report({ node: node.property, messageId });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          CONDITIONAL_SKIPS.has(nameOf(callee.property) ?? '') &&
          isTestFunctionChain(callee.object) &&
          isLiteralCondition(node.arguments[0])
        ) {
          context.report({ node: callee.property, messageId: 'literalCondition' });
        }
        if (!(isCaseCall(node) || isSuiteCall(node) || isSubtestCall(node))) {
          return;
        }
        const option = switchedOffOption(node);
        if (option !== undefined) {
          context.report({ node: option, messageId: 'fixedOption' });
        }
        const skipCall = bodySwitchOff(node);
        if (skipCall !== undefined) {
          context.report({ node: skipCall, messageId: 'unconditionalSkip' });
        }
      },
    };
  },
};
