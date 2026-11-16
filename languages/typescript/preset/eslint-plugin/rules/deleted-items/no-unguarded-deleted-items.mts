import { typeServices } from '../security/security-values.mts';
import { followedFlag, iterationsOf } from './project-index.mts';

function allowedForms(followed) {
  const forms = [`a guard on \`${followed.name}\``];
  if (followed.helper !== undefined) {
    forms.push(`the helper \`${followed.helper}\``);
  }
  if (followed.alias !== undefined) {
    forms.push(`the type \`${followed.alias}\``);
  }
  return forms.join(', ');
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Skip the items the project's deleted or visibility flag marks when iterating a collection",
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      unguarded: [
        'This `{{kind}}` over `{{type}}` does not skip the items that `{{flag}}` marks, which {{share}}% of the',
        'iterations over that type in this project do, so deleted items can reach the result.',
        'Skip them with {{allowed}}.',
        'An exception fits undo, trash, restore and sync code that reads flagged items on purpose.',
      ].join(' '),
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    return {
      Program(program) {
        const { program: tsProgram, esTreeNodeToTSNodeMap } = services;
        const sourceFile = esTreeNodeToTSNodeMap.get(program);
        const checker = tsProgram.getTypeChecker();
        for (const iteration of iterationsOf(sourceFile, checker)) {
          const followed = iteration.guarded
            ? undefined
            : followedFlag(tsProgram, iteration.flag.key);
          if (followed !== undefined) {
            const start = sourceFile.getLineAndCharacterOfPosition(
              iteration.node.getStart(sourceFile),
            );
            const end = sourceFile.getLineAndCharacterOfPosition(iteration.node.getEnd());
            context.report({
              loc: {
                start: { line: start.line + 1, column: start.character },
                end: { line: end.line + 1, column: end.character },
              },
              messageId: 'unguarded',
              data: {
                kind: iteration.kind,
                type: iteration.type,
                flag: followed.name,
                share: String(followed.share),
                allowed: allowedForms(followed),
              },
            });
          }
        }
      },
    };
  },
};
