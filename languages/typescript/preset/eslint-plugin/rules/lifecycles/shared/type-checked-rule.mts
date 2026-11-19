import type { ParserServicesWithTypeInformation, TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typedScopeOf } from '../../promises/cannot-reject.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { typedRuleMeta } from '../../program-rules/typed-program-rule.mts';

type TypeCheckedEnv<MessageId extends string> = {
  readonly context: Readonly<TSESLint.RuleContext<MessageId, []>>;
  readonly sourceCode: SourceCode;
  readonly checker: TypeScript.TypeChecker;
  readonly nodeMap: ParserServicesWithTypeInformation['esTreeNodeToTSNodeMap'];
};

type TypeCheckedRuleSpec<MessageId extends string> = {
  readonly description: string;
  readonly messages: Readonly<Record<MessageId, string>>;
  readonly listeners: (env: TypeCheckedEnv<MessageId>) => TSESLint.RuleListener;
};

export function typeCheckedRule<MessageId extends string>(
  spec: TypeCheckedRuleSpec<MessageId>,
): TSESLint.RuleModule<MessageId, [], { readonly requiresTypeChecking: boolean }> {
  return {
    meta: typedRuleMeta(spec),
    create(context) {
      const typed = typedScopeOf(context);
      if (typed === undefined) {
        return {};
      }
      const { sourceCode, services } = typed;
      return spec.listeners({
        context,
        sourceCode,
        checker: services.program.getTypeChecker(),
        nodeMap: services.esTreeNodeToTSNodeMap,
      });
    },
  };
}
