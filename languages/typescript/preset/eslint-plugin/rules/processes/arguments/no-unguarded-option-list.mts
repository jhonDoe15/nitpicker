import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { nameOf } from '../../typed/node-views.mts';
import { calleeMethod, trackedBindings } from '../process-callees.mts';
import { joinedList, resolvedValue } from './list-sources.mts';
import { possiblyEmptyList } from './possibly-empty.mts';

type MessageIds = 'emptyOptionValue' | 'emptyFiles';

const FILE_FORMS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'fork',
  'execa',
  'execaSync',
  'execaNode',
]);
const CONFIG_KEYS = new Set([
  'rules',
  'languageOptions',
  'plugins',
  'settings',
  'linterOptions',
  'processor',
]);
const FLAG = /^-{1,2}[A-Za-z][\w-]*$/u;

function listOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.SpreadElement ? undefined : joinedList(node)?.list;
}

function isFlag(node: TSESTree.ArrayExpression['elements'][number] | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string' && FLAG.test(node.value)
  );
}

function optionValues(context: SourceContext, call: TSESTree.CallExpression): TSESTree.Node[] {
  const list = resolvedValue(context, call.arguments[1]);
  if (list?.type !== AST_NODE_TYPES.ArrayExpression) {
    return [];
  }
  return list.elements.flatMap((element, index) => {
    const value = list.elements[index + 1];
    const items = value === null || value === undefined ? undefined : listOf(value);
    return isFlag(element) &&
      value !== null &&
      value !== undefined &&
      items !== undefined &&
      possiblyEmptyList(context, items)
      ? [value]
      : [];
  });
}

function isPushed(node: TSESTree.ObjectExpression): boolean {
  const { parent } = node;
  return (
    (parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.includes(node) &&
      ['push', 'unshift'].includes(
        nameOf(
          parent.callee.type === AST_NODE_TYPES.MemberExpression
            ? parent.callee.property
            : undefined,
        ) ?? '',
      )) ||
    parent.type === AST_NODE_TYPES.ArrayExpression
  );
}

function emptyFiles(
  context: SourceContext,
  node: TSESTree.ObjectExpression,
): TSESTree.Node | undefined {
  const properties = node.properties.filter(
    (property) => property.type === AST_NODE_TYPES.Property,
  );
  const files = properties.find((property) => propertyKeyName(property) === 'files');
  const isConfig = properties.some((property) => CONFIG_KEYS.has(propertyKeyName(property) ?? ''));
  return files !== undefined &&
    isConfig &&
    isPushed(node) &&
    possiblyEmptyList(context, files.value)
    ? files.value
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow building an option from a list that can be empty without checking it',
    },
    schema: [],
    messages: {
      emptyOptionValue:
        "This option takes its value from a list that a filter or a listing in this function can leave empty, and nothing checks its length. With an empty list the tool gets an empty value (--dir '') or takes the next flag as the value, and most tools then fall back to their default (the working directory, every file) or reject the run. Check the list first and skip the option, or the run, when it is empty.",
      emptyFiles:
        'This configuration block takes files from a list that a filter or a listing in this function can leave empty, and nothing checks its length. ESLint rejects a block with an empty files array, and the whole configuration fails to load. Leave the block out when the list is empty.',
    },
  },
  create(context) {
    return trackedBindings('plain', (current) => ({
      CallExpression(node) {
        const method = calleeMethod(node.callee, current());
        if (method === undefined || !FILE_FORMS.has(method)) {
          return;
        }
        for (const value of optionValues(context, node)) {
          context.report({ node: value, messageId: 'emptyOptionValue' });
        }
      },
      ObjectExpression(node) {
        const files = emptyFiles(context, node);
        if (files !== undefined) {
          context.report({ node: files, messageId: 'emptyFiles' });
        }
      },
    }));
  },
};
