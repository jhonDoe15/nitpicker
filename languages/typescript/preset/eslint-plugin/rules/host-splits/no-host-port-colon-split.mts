import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, resolveConstant } from '../analysis/constant-resolution.mts';
import { splitCallOf } from '../text-splits/split-calls.mts';
import { ancestorsOf } from '../typed/node-views.mts';
import { isHostValue } from './host-sources.mts';

const IPV6_AWARE = /isIPv6|ipv6|IPv6|['"`]\[['"`]|['"`]\]['"`]/u;
const SLICERS = new Set(['slice', 'substring', 'substr']);

function member(
  node: TSESTree.CallExpression,
): { object: TSESTree.Node; name: string } | undefined {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? { object: callee.object, name: callee.property.name }
    : undefined;
}

function isFirstColonCall(node: TSESTree.CallExpression): boolean {
  const [first] = node.arguments;
  return (
    member(node)?.name === 'indexOf' &&
    first?.type === AST_NODE_TYPES.Literal &&
    first.value === ':'
  );
}

export const rule: TSESLint.RuleModule<'hostSplit'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow splitting a host or authority on ":" to get the host and the port',
    },
    schema: [],
    messages: {
      hostSplit:
        'Do not cut a host and port at `:`. An IPv6 literal (`[::1]:3000`) has colons of its own, so the ' +
        'host becomes `[` and the port is lost or wrong. Parse it with `new URL(`http://${host}`)` and read ' +
        '`hostname` and `port`, or cut after the closing bracket. A value that is known not to be an IPv6 ' +
        'address takes an exception.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function isChecked(node: TSESTree.Node): boolean {
      const scope = ancestorsOf(node).find(
        (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
      );
      return scope !== undefined && IPV6_AWARE.test(sourceCode.getText(scope));
    }

    function report(node: TSESTree.Node): void {
      if (!isChecked(node)) {
        context.report({ node, messageId: 'hostSplit' });
      }
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const split = splitCallOf(context, node);
        if (split?.separator === ':' && isHostValue(split.receiver)) {
          report(node);
          return;
        }
        const call = member(node);
        if (call !== undefined && SLICERS.has(call.name) && isHostValue(call.object)) {
          const colon = node.arguments
            .map((argument) => resolveConstant(context, argument))
            .find(
              (argument) =>
                argument?.type === AST_NODE_TYPES.CallExpression &&
                isFirstColonCall(argument) &&
                sourceCode.getText(member(argument)?.object) === sourceCode.getText(call.object),
            );
          if (colon !== undefined) {
            report(node);
          }
        }
      },
    };
  },
};
