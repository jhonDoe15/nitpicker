import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../../rules/typed/node-views.mts';
import { replacing, type FixPlan } from '../../support/ranges.mts';
import { allOf, type FixPlans } from '../plans.mts';

export type UseEdit = {
  readonly imports: FixPlan | undefined;
  readonly text: string;
};

export type UseSite = {
  readonly sourceCode: SourceCode;
  readonly call: TSESTree.CallExpression;
};

type UseCase = {
  readonly code: string;
  readonly output?: string;
  readonly errors: { messageId: 'use' }[];
};

const ERR = [{ messageId: 'use' as const }];

export function useRule(
  editOf: (site: UseSite) => UseEdit | undefined,
): TSESLint.RuleModule<'use'> {
  return {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: { use: 'use' },
      defaultOptions: [],
    },
    create(context) {
      const { sourceCode } = context;
      return {
        'CallExpression[callee.name="use"]'(call: TSESTree.CallExpression) {
          const edit = editOf({ sourceCode, call });
          const fix: FixPlans | undefined =
            edit === undefined
              ? undefined
              : allOf(
                  [edit.imports, replacing(call.range, edit.text)].filter(
                    (plan) => plan !== undefined,
                  ),
                );
          context.report({ node: call, messageId: 'use', ...(fix === undefined ? {} : { fix }) });
        },
      };
    },
  };
}

export function fixes(code: string, output: string): UseCase {
  return { code, output, errors: ERR };
}

export function declines(code: string): UseCase {
  return { code, errors: ERR };
}
