import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameOf, type SourceCode } from '../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';
import {
  isGuarded,
  isInsideTry,
  isPercentTest,
  isPromiseCaught,
  functionOf,
  type Candidate,
  type Guard,
} from './handled-contexts.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const MAX_PARTS = 100;
const DECODERS = new Set(['decodeURI', 'decodeURIComponent']);
const ENCODERS = new Set(['encodeURI', 'encodeURIComponent']);
const PARSED_MEMBERS = new Set(['href', 'url', 'origin']);

function isUrlIdentifier(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === 'URL';
}

function isUrlConstructor(node: TSESTree.Node): boolean {
  return (
    isUrlIdentifier(node) ||
    (node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === 'globalThis' &&
      isUrlIdentifier(node.property))
  );
}

function annotatedType(definition: TSESLint.Scope.Definition): TSESTree.TypeNode | undefined {
  const holder =
    definition.type === TSESLint.Scope.DefinitionType.Variable
      ? definition.node.id
      : definition.name;
  return 'typeAnnotation' in holder ? holder.typeAnnotation?.typeAnnotation : undefined;
}

function isUrlTyped(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definitions = findVariable(context, node, node.name)?.defs ?? [];
  const [only] = definitions;
  const type = definitions.length === 1 && only !== undefined ? annotatedType(only) : undefined;
  return type?.type === AST_NODE_TYPES.TSTypeReference && isUrlIdentifier(type.typeName);
}

function globalCallName(node: TSESTree.Node): string | undefined {
  const callee = node.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
  if (callee?.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee?.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'globalThis' &&
    !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function isDecoder(node: TSESTree.CallExpression): boolean {
  return DECODERS.has(globalCallName(node) ?? '');
}

function isEncoded(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  return value.type === AST_NODE_TYPES.CallExpression && ENCODERS.has(globalCallName(value) ?? '');
}

function isCanParse(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    isUrlIdentifier(callee.object) &&
    !callee.computed &&
    nameOf(callee.property) === 'canParse'
  );
}

function textParts(
  context: SourceContext,
  node: TSESTree.Node,
): readonly TSESTree.Node[] | undefined {
  const value = resolveConstant(context, node);
  if (stringValue(value) !== undefined) {
    return [];
  }
  if (value?.type === AST_NODE_TYPES.BinaryExpression && value.operator === '+') {
    return [value.left, value.right];
  }
  return value?.type === AST_NODE_TYPES.TemplateLiteral ? value.expressions : undefined;
}

function isConstantText(context: SourceContext, node: TSESTree.Node): boolean {
  const pending = [node];
  for (const current of pending) {
    const parts = textParts(context, current);
    if (parts === undefined || pending.length > MAX_PARTS) {
      return false;
    }
    appendAll(pending, parts);
  }
  return true;
}

function isParsedMember(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    PARSED_MEMBERS.has(node.property.name)
  );
}

function isUrlValue(context: SourceContext, node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  const resolved = resolveConstant(context, value);
  return (
    isParsedMember(value) ||
    isUrlTyped(context, value) ||
    (resolved?.type === AST_NODE_TYPES.NewExpression && isUrlConstructor(resolved.callee))
  );
}

function isSafeText(context: SourceContext, node: TSESTree.Node): boolean {
  return isConstantText(context, node) || isUrlValue(context, node);
}

function isImportMetaUrl(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.MetaProperty &&
    node.object.meta.name === 'import' &&
    nameOf(node.property) === 'url'
  );
}

function isModuleBase(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  const chain = [node];
  for (const current of chain) {
    const value = current === undefined ? undefined : resolveConstant(context, current);
    if (isImportMetaUrl(value)) {
      return true;
    }
    if (
      value?.type === AST_NODE_TYPES.NewExpression &&
      isUrlConstructor(value.callee) &&
      chain.length < MAX_PARTS
    ) {
      chain.push(value.arguments[1]);
    }
  }
  return false;
}

function isUnhandledParse(context: SourceContext, node: TSESTree.NewExpression): boolean {
  const [argument, base] = node.arguments;
  return (
    isUrlConstructor(node.callee) &&
    argument !== undefined &&
    argument.type !== AST_NODE_TYPES.SpreadElement &&
    !isModuleBase(context, base) &&
    !(isSafeText(context, argument) && (base === undefined || isSafeText(context, base))) &&
    !isInsideTry(node)
  );
}

function isUnhandledDecode(context: SourceContext, node: TSESTree.CallExpression): boolean {
  const [argument] = node.arguments;
  return (
    isDecoder(node) &&
    argument !== undefined &&
    argument.type !== AST_NODE_TYPES.SpreadElement &&
    !isConstantText(context, argument) &&
    !isEncoded(argument) &&
    !isInsideTry(node) &&
    !isPromiseCaught(node)
  );
}

function guardOf(sourceCode: SourceCode, node: TSESTree.CallExpression): Guard | undefined {
  const [argument] = node.arguments;
  return argument === undefined
    ? undefined
    : {
        text: sourceCode.getText(unwrapOf(argument, ASSERTION_FORMS)),
        scope: functionOf(node),
      };
}

export const rule: TSESLint.RuleModule<'unhandledUrlParse' | 'unhandledDecode'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require new URL(text) and decodeURI(Component)(text) on runtime text to be checked, parsed without ' +
        'throwing, or wrapped in a try',
    },
    schema: [],
    messages: {
      unhandledDecode:
        'Handle the failure of this decode: `decodeURIComponent(text)` and `decodeURI(text)` throw `URIError: ' +
        'URI malformed` on a `%` that does not start a valid escape (`100%.png`, a stray `%` in a cookie, ' +
        'query value or path), so one odd request or file crashes the middleware or fails the build. Wrap ' +
        'the call in a `try` with a `catch` that keeps the raw text or answers 400, or call a helper that ' +
        'does (`safeDecode`, `tryDecode`). Constant text and text built by `encodeURIComponent` in the same ' +
        'call are fine.',
      unhandledUrlParse:
        'Parse this text with `URL.parse(text)` (null when it is not a URL), check `URL.canParse(text)` first, ' +
        'or build the URL in a `try` whose catch handles the failure. `new URL(text)` throws a TypeError ' +
        'on text that is not an absolute URL (no scheme, a bad host, `//` against a base), so one odd stored, ' +
        'user or header value turns this call into an error response. Constant text and a base are fine, ' +
        'and so are a `URL` value, an already parsed `.href`, `.url` or `.origin`, and ' +
        '`new URL(path, import.meta.url)`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const candidates: Candidate[] = [];
    const decodes: Candidate[] = [];
    const guards: Guard[] = [];
    const percentGuards: Guard[] = [];

    function reportUnguarded(
      found: readonly Candidate[],
      among: readonly Guard[],
      messageId: 'unhandledUrlParse' | 'unhandledDecode',
    ): void {
      for (const candidate of found) {
        if (!isGuarded(sourceCode, candidate, among)) {
          context.report({ node: candidate.node, messageId });
        }
      }
    }

    return {
      NewExpression(node: TSESTree.NewExpression) {
        const [argument] = node.arguments;
        if (argument !== undefined && isUnhandledParse(context, node)) {
          candidates.push({ node, argument });
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        const [argument] = node.arguments;
        if (argument !== undefined && isUnhandledDecode(context, node)) {
          decodes.push({ node, argument });
        }
        const guard =
          isCanParse(node) || isPercentTest(node) ? guardOf(sourceCode, node) : undefined;
        if (guard !== undefined) {
          (isCanParse(node) ? guards : percentGuards).push(guard);
        }
      },
      'Program:exit'() {
        reportUnguarded(candidates, guards, 'unhandledUrlParse');
        reportUnguarded(decodes, percentGuards, 'unhandledDecode');
      },
    };
  },
};
