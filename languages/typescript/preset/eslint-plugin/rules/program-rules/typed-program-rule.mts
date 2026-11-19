import type { TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices } from '../security/security-values.mts';

export type ProgramScope = {
  readonly program: TypeScript.Program;
  readonly checker: TypeScript.TypeChecker;
  readonly sourceFile: TypeScript.SourceFile;
};

export type ProgramFinding = {
  readonly node: TypeScript.Node;
  readonly data: Readonly<Record<string, string>>;
};

type ProgramRuleSpec<MessageId extends string> = {
  readonly description: string;
  readonly messageId: MessageId;
  readonly messages: Readonly<Record<MessageId, string>>;
  readonly findings: (scope: ProgramScope) => readonly ProgramFinding[];
};

export function typedRuleMeta<MessageId extends string>(spec: {
  readonly description: string;
  readonly messages: Readonly<Record<MessageId, string>>;
}): TSESLint.RuleMetaData<MessageId, { readonly requiresTypeChecking: boolean }> {
  return {
    type: 'problem',
    docs: { description: spec.description, requiresTypeChecking: true },
    schema: [],
    messages: spec.messages,
  };
}

export function typedProgramRule<MessageId extends string>(
  spec: ProgramRuleSpec<MessageId>,
): TSESLint.RuleModule<MessageId, [], { readonly requiresTypeChecking: boolean }> {
  return {
    meta: typedRuleMeta(spec),
    create(context) {
      const services = typeServices(context);
      if (services === undefined) {
        return {};
      }
      return {
        Program(program) {
          const sourceFile = services.esTreeNodeToTSNodeMap.get(program);
          const scope = {
            program: services.program,
            checker: services.program.getTypeChecker(),
            sourceFile,
          };
          for (const { node, data } of spec.findings(scope)) {
            const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
            context.report({
              loc: {
                start: { line: start.line + 1, column: start.character },
                end: { line: end.line + 1, column: end.character },
              },
              messageId: spec.messageId,
              data,
            });
          }
        },
      };
    },
  };
}
