import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { argumentTexts, childCall, childStarts, staticText } from '../child-heaps/child-calls.mts';
import { startsRepeatedly } from '../child-heaps/repeated-starts.mts';
import { isListing } from '../processes/arguments/list-sources.mts';
import { isListWord } from '../whole-lists/unbounded-lists.mts';

const { DefinitionType } = TSESLint.Scope;
const HEAVY_COMMANDS = /(?:^|[/\\])(?:tsc|tsgo|tsgolint|vue-tsc)(?:\.exe|\.cmd)?$/;
const HEAVY_FLAGS = new Set(['--type-aware', '--type-check', '--typecheck']);

function isParameter(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  return definition?.type === DefinitionType.Parameter && isListWord(node.name);
}

function wholeSpread(
  context: SourceContext,
  args: TSESTree.ArrayExpression,
): TSESTree.SpreadElement | undefined {
  return args.elements.find(
    (element): element is TSESTree.SpreadElement =>
      element?.type === AST_NODE_TYPES.SpreadElement &&
      (isParameter(context, element.argument) || isListing(context, element.argument)),
  );
}

function isHeavy(
  context: SourceContext,
  command: TSESTree.Node | undefined,
  flags: readonly string[],
): boolean {
  return (
    HEAVY_COMMANDS.test(staticText(context, command) ?? '') ||
    flags.some((flag) => HEAVY_FLAGS.has(flag))
  );
}

export const rule: TSESLint.RuleModule<'unbatchedRun'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow handing a whole unbounded file list to one memory-heavy type-aware run',
    },
    schema: [],
    messages: {
      unbatchedRun:
        'This hands a whole file list that grows with the project to one type-aware run (tsc, tsgo, tsgolint, a --type-aware linter). Such a run builds one program over every file it gets, so its memory grows with the project (5.4 GB for 4,400 files). Split the list into bounded batches (for example 500 files, each with the files that change the global scope) and run once per batch. Splitting only to stay under the command line limit does not bound memory.',
    },
  },
  create(context) {
    return childStarts((node) => {
      const { command, args } = childCall(context, node);
      if (args === undefined || !isHeavy(context, command, argumentTexts(context, args))) {
        return;
      }
      const spread = wholeSpread(context, args);
      if (spread !== undefined && !startsRepeatedly(context, node)) {
        context.report({ node: spread, messageId: 'unbatchedRun' });
      }
    });
  },
};
