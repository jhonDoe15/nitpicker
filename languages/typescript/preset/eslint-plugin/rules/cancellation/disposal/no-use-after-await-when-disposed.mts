import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { unguardedUses, nodesOf } from './after-await-uses.mts';
import { flagsSetByTeardown, methodName } from './disposal-flags.mts';

type Callable = TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

function asyncBody(member: TSESTree.ClassElement): Callable | undefined {
  const value =
    member.type === AST_NODE_TYPES.MethodDefinition ||
    member.type === AST_NODE_TYPES.PropertyDefinition
      ? member.value
      : undefined;
  return value !== null &&
    value !== undefined &&
    (value.type === AST_NODE_TYPES.FunctionExpression ||
      value.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    value.async
    ? value
    : undefined;
}

function calledFromConstructor(body: readonly TSESTree.ClassElement[]): ReadonlySet<string> {
  const constructor = body.find((member) => methodName(member) === 'constructor');
  const value =
    constructor?.type === AST_NODE_TYPES.MethodDefinition ? constructor.value : undefined;
  return new Set(
    value === undefined
      ? []
      : nodesOf(value).flatMap((node) =>
          node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.ThisExpression &&
          node.property.type === AST_NODE_TYPES.Identifier
            ? [node.property.name]
            : [],
        ),
  );
}

const KINDS: Readonly<Record<string, string>> = {
  event: 'fires an event',
  resource: 'starts a timer or process',
};

export const rule: TSESLint.RuleModule<'afterAwait'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report an async method of a disposable class that fires an event or starts a resource after an await without checking the disposed flag',
    },
    schema: [],
    messages: {
      afterAwait:
        'This async method of a class with `{{flag}}` {{kind}} after an `await` without checking it, so it can run on an object disposed while it waited. Check `if (this.{{flag}}) return;` after the await, before this use. An exception fits only when dispose waits for the method.',
    },
  },
  create(context) {
    return {
      ClassBody(node) {
        const flags = flagsSetByTeardown(node.body, nodesOf);
        const [flag] = flags;
        if (flag === undefined) {
          return;
        }
        const skipped = calledFromConstructor(node.body);
        for (const member of node.body) {
          const method = asyncBody(member);
          const name = methodName(member);
          if (method === undefined || name === undefined || skipped.has(name)) {
            continue;
          }
          const [use] = unguardedUses(method, flags);
          if (use !== undefined) {
            context.report({
              node: use.node,
              messageId: 'afterAwait',
              data: { flag, kind: KINDS[use.kind] ?? 'acts' },
            });
          }
        }
      },
    };
  },
};
