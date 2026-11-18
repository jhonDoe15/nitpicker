import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { hermeticFix } from '../../../fixes/processes/hermetic-git-fix.mts';
import { collectObjectKeys } from '../object-keys.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import type { ModuleBindings, Subprocess } from '../../analysis/subprocess-calls.mts';
import {
  describeSubprocess,
  describeWrapperCall,
  propertyKeyName,
  resolveConstant,
  subprocessBindings,
} from '../../analysis/test-code-analysis.mts';

const HERMETIC_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];

function environmentNode(
  context: SourceContext,
  optionsNode: TSESTree.Node | undefined,
): TSESTree.Node | undefined {
  const resolved = resolveConstant(context, optionsNode);
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const property = resolved.properties.find(
    (candidate): candidate is TSESTree.Property =>
      candidate.type === AST_NODE_TYPES.Property && propertyKeyName(candidate) === 'env',
  );
  return property?.value;
}

function isHermetic(context: SourceContext, described: Subprocess): boolean {
  const keys = collectObjectKeys(
    context,
    environmentNode(context, described.optionsNode),
    propertyKeyName,
  ).keys;
  return HERMETIC_KEYS.every((key) => keys.has(key));
}

export const rule: TSESLint.RuleModule<'nonHermeticGit'> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      nonHermeticGit:
        "Run git in tests with a hermetic environment: pass an `env` object, written in this file, that sets GIT_CONFIG_GLOBAL (for example to '/dev/null') and GIT_CONFIG_NOSYSTEM=1, so the developer's global git config (commit signing, hooks) does not apply.",
    },
  },
  create(context) {
    let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
    const reported = new Set<TSESTree.Node>();
    function check(described: Subprocess, node: TSESTree.CallExpression): void {
      if (described.command !== 'git' || reported.has(node) || isHermetic(context, described)) {
        return;
      }
      reported.add(node);
      context.report(
        fixable(
          { node, messageId: 'nonHermeticGit' },
          hermeticFix(context.sourceCode, described.optionsNode),
        ),
      );
    }
    return {
      Program(node) {
        bindings = subprocessBindings(node);
      },
      CallExpression(node) {
        const direct = describeSubprocess(context, node, bindings);
        if (direct !== undefined) {
          check(direct, node);
          return;
        }
        const wrapped = describeWrapperCall(context, node, bindings);
        if (wrapped !== undefined && wrapped.inner.command !== 'git' && wrapped.command === 'git') {
          check({ ...wrapped.inner, command: 'git' }, wrapped.node);
        }
      },
    };
  },
};
