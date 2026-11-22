import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { bindingName, staticCommandText, wordsOf } from '../support/process-command-helpers.mts';

const GO_TOOL_NAMES = new Set(['tsgo', 'tsgolint', 'gopls']);
const GO_TOOL_PATH = /(?:^|\/)(?:tsgo|tsgolint|gopls)(?:\.exe)?$/iu;
const NATIVE_PREVIEW_PATH =
  /@typescript\/native-preview(?:-[^/]+)?(?:\/(?:lib\/tsc(?:\.exe)?|bin\/[^/]+))?$/iu;
const TS7_PLATFORM_TSC = /native-preview[^/]*\/lib\/tsc(?:\.exe)?$/iu;

function bindingNamesGoTool(node: TSESTree.Node | undefined): boolean {
  const name = bindingName(node);
  return name !== undefined && wordsOf(name).some((word) => GO_TOOL_NAMES.has(word));
}

function matchesGoToolPath(text: string): boolean {
  const normalized = text.replaceAll('\\', '/');
  return (
    GO_TOOL_PATH.test(normalized) ||
    NATIVE_PREVIEW_PATH.test(normalized) ||
    TS7_PLATFORM_TSC.test(normalized)
  );
}

function hasApiFlag(context: SourceContext, argsNode: TSESTree.Node | undefined): boolean {
  const resolved = resolveConstant(context, argsNode);
  if (resolved?.type !== AST_NODE_TYPES.ArrayExpression) {
    return false;
  }
  return resolved.elements.some(
    (element) =>
      element !== null &&
      element.type !== AST_NODE_TYPES.SpreadElement &&
      stringValue(resolveConstant(context, element)) === '--api',
  );
}

export function isGoToolCall(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const [commandNode, argsNode] = call.arguments;
  if (bindingNamesGoTool(commandNode)) {
    return true;
  }
  const text = staticCommandText(context, commandNode);
  if (text !== undefined && matchesGoToolPath(text)) {
    return true;
  }
  return hasApiFlag(context, argsNode);
}
