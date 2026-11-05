import {
  enclosingScope,
  heldRegex,
  isInLoopWithout,
  isLoopCondition,
  unwrapped,
} from './regex-bindings.mjs';

const REGEX_METHODS = new Set(['test', 'exec']);
const STICKY_STRING_METHODS = new Set(['match', 'replace']);

function methodName(callee) {
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
    ? callee.property.name
    : undefined;
}

function isBefore(left, right) {
  return left.range[1] <= right.range[0];
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reusing a regex with the g or y flag across calls through test(), exec() or a sticky match()',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      sharedRegex:
        '`{{ name }}` has the `{{ flag }}` flag and is reused across calls, so `{{ method }}()` starts at the `lastIndex` the previous call left and the result depends on call order. Drop `{{ flag }}` when one match is enough, walk all matches with `text.matchAll(pattern)`, or create the regex where it is used.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const uses = [];
    const resets = [];

    function regexArgument(node, method) {
      if (REGEX_METHODS.has(method)) {
        return node.callee.object;
      }
      return STICKY_STRING_METHODS.has(method) ? node.arguments[0] : undefined;
    }

    function holderKey(target) {
      const held = heldRegex(context, target);
      return held === undefined ? undefined : { key: held.creation, held };
    }

    function collectUse(node, method, target) {
      const holder = holderKey(target);
      const skipped =
        holder === undefined || (STICKY_STRING_METHODS.has(method) && holder.held.flag !== 'y');
      if (!skipped) {
        uses.push({ node, method, target, ...holder, scope: enclosingScope(node) });
      }
    }

    function isReset(use) {
      return resets.some(
        (reset) =>
          reset.key === use.key && reset.scope === use.scope && isBefore(reset.node, use.node),
      );
    }

    function isEarlierUse(use) {
      return uses.some(
        (other) =>
          other !== use &&
          other.key === use.key &&
          other.scope === use.scope &&
          isBefore(other.node, use.node),
      );
    }

    function isShared(use) {
      const { creation } = use.held;
      return (
        enclosingScope(creation) !== use.scope ||
        isInLoopWithout(use.node, use.scope, creation) ||
        isEarlierUse(use)
      );
    }

    function report(use) {
      context.report({
        node: use.node,
        messageId: 'sharedRegex',
        data: {
          name: sourceCode.getText(unwrapped(use.target)),
          method: use.method,
          flag: use.held.flag,
        },
      });
    }

    return {
      CallExpression(node) {
        const method = methodName(node.callee);
        const target = method === undefined ? undefined : regexArgument(node, method);
        if (target !== undefined) {
          collectUse(node, method, target);
        }
      },
      AssignmentExpression(node) {
        const { left } = node;
        if (left.type === 'MemberExpression' && methodName(left) === 'lastIndex') {
          const holder = holderKey(left.object);
          if (holder !== undefined) {
            resets.push({ node, key: holder.key, scope: enclosingScope(node) });
          }
        }
      },
      'Program:exit'() {
        uses
          .filter((use) => !isLoopCondition(use.node) && !isReset(use) && isShared(use))
          .forEach(report);
      },
    };
  },
};
