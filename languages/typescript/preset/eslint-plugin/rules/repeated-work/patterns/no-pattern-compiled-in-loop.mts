import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { innermostRepeat, invariantIn } from '../support/loop-invariance.mts';
import { patternCall } from './glob-calls.mts';
import { compiledEachPass } from './pattern-guards.mts';

export const rule: TSESLint.RuleModule<'compiledPerPass'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow compiling the same glob again on every pass of a loop or iteration callback',
    },
    schema: [],
    messages: {
      compiledPerPass:
        '`{{call}}` compiles the pattern `{{pattern}}` again on every pass of this loop or callback, although the pattern does not change inside it. Compile it once before the loop and reuse the matcher (`picomatch(pattern)`, `new Minimatch(pattern)`, `micromatch.matcher(pattern)`), or test a cheap condition first (a prefix or suffix check) so the matcher runs on few elements.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function check(call: TSESTree.CallExpression | TSESTree.NewExpression): void {
      const found = patternCall(sourceCode, call);
      const repeat = found === undefined ? undefined : innermostRepeat(call);
      if (found === undefined || repeat === undefined) {
        return;
      }
      if (
        invariantIn(sourceCode, found.pattern, repeat.node) &&
        compiledEachPass(sourceCode, { call, pattern: found.pattern }, repeat)
      ) {
        context.report({
          node: call,
          messageId: 'compiledPerPass',
          data: { call: found.name, pattern: sourceCode.getText(found.pattern) },
        });
      }
    }
    return { CallExpression: check, NewExpression: check };
  },
};
