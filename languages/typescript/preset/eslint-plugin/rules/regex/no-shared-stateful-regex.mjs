import {
  enclosingScope,
  heldRegex,
  areExclusive,
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

function regexArgument(node, method) {
  if (REGEX_METHODS.has(method)) {
    return node.callee.object;
  }
  return STICKY_STRING_METHODS.has(method) ? node.arguments[0] : undefined;
}

function holderKey(context, target) {
  const held = heldRegex(context, target);
  return held === undefined ? undefined : { key: held.creation, held };
}

function collectUse(state, { node, method, target }) {
  const holder = holderKey(state.context, target);
  const skipped =
    holder === undefined || (STICKY_STRING_METHODS.has(method) && holder.held.flag !== 'y');
  if (!skipped) {
    state.uses.push({ node, method, target, ...holder, scope: enclosingScope(node) });
  }
}

function collectReset(state, node) {
  const { left } = node;
  if (left.type !== 'MemberExpression' || methodName(left) !== 'lastIndex') {
    return;
  }
  const holder = holderKey(state.context, left.object);
  if (holder !== undefined) {
    state.resets.push({ node, key: holder.key, scope: enclosingScope(node) });
  }
}

function isReset(state, use) {
  return state.resets.some((reset) => reset.key === use.key && reset.scope === use.scope);
}

function isEarlierUse(state, use) {
  return state.uses.some(
    (other) =>
      other !== use &&
      other.key === use.key &&
      other.scope === use.scope &&
      isBefore(other.node, use.node) &&
      !areExclusive(other.node, use.node),
  );
}

function isShared(state, use) {
  const { creation } = use.held;
  return (
    enclosingScope(creation) !== use.scope ||
    isInLoopWithout(use.node, use.scope, creation) ||
    isEarlierUse(state, use)
  );
}

function report(context, use) {
  context.report({
    node: use.node,
    messageId: 'sharedRegex',
    data: {
      name: context.sourceCode.getText(unwrapped(use.target)),
      method: use.method,
      flag: use.held.flag,
    },
  });
}

function reportShared(state) {
  for (const use of state.uses) {
    if (!isLoopCondition(use.node) && !isReset(state, use) && isShared(state, use)) {
      report(state.context, use);
    }
  }
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
        'Create the regex where it is used, drop `{{ flag }}` when one match is enough, or walk every match with `text.matchAll(pattern)`, which leaves `pattern` untouched. `{{ name }}` has the `{{ flag }}` flag and is reused across calls, so `{{ method }}()` starts at the `lastIndex` the previous call left and the result depends on call order.',
    },
  },
  create(context) {
    const state = { context, uses: [], resets: [] };
    return {
      CallExpression(node) {
        const method = methodName(node.callee);
        const target = method === undefined ? undefined : regexArgument(node, method);
        if (target !== undefined) {
          collectUse(state, { node, method, target });
        }
      },
      AssignmentExpression(node) {
        collectReset(state, node);
      },
      'Program:exit'() {
        reportShared(state);
      },
    };
  },
};
