import {
  describeSubprocess,
  describeWrapperCall,
  propertyKeyName,
  resolveConstant,
  subprocessBindings,
} from '../../analysis/test-code-analysis.mjs';

const HERMETIC_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];

function recordKey(property, keys, pending) {
  if (property.type === 'SpreadElement') {
    pending.push(property.argument);
    return;
  }
  const name = propertyKeyName(property);
  if (name !== undefined) keys.add(name);
}

function objectKeys(context, node, seen = new Set()) {
  const pending = [node];
  const keys = new Set();
  for (const current of pending) {
    const resolved = resolveConstant(context, current);
    if (resolved?.type !== 'ObjectExpression' || seen.has(resolved)) continue;
    seen.add(resolved);
    for (const property of resolved.properties) recordKey(property, keys, pending);
  }
  return keys;
}

function environmentNode(context, optionsNode) {
  const resolved = resolveConstant(context, optionsNode);
  if (resolved?.type !== 'ObjectExpression') return undefined;
  const property = resolved.properties.find(
    (candidate) => candidate.type === 'Property' && propertyKeyName(candidate) === 'env',
  );
  return property?.value;
}

function isHermetic(context, described) {
  const keys = objectKeys(context, environmentNode(context, described.optionsNode));
  return HERMETIC_KEYS.every((key) => keys.has(key));
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      nonHermeticGit:
        "Run git in tests with a hermetic environment: pass an `env` object, written in this file, that sets GIT_CONFIG_GLOBAL (for example to '/dev/null') and GIT_CONFIG_NOSYSTEM=1, so the developer's global git config (commit signing, hooks) does not apply.",
    },
  },
  create(context) {
    let bindings = { named: new Map(), namespaces: new Set() };
    const reported = new Set();
    function check(described, node) {
      if (described.command !== 'git' || reported.has(node) || isHermetic(context, described)) {
        return;
      }
      reported.add(node);
      context.report({ node, messageId: 'nonHermeticGit' });
    }
    return {
      Program(node) {
        bindings = subprocessBindings(node);
      },
      CallExpression(node) {
        const direct = describeSubprocess(context, node, bindings);
        if (direct) {
          check(direct, node);
          return;
        }
        const wrapped = describeWrapperCall(context, node, bindings);
        if (wrapped && wrapped.inner.command !== 'git' && wrapped.command === 'git') {
          check({ ...wrapped.inner, command: 'git' }, wrapped.node);
        }
      },
    };
  },
};
