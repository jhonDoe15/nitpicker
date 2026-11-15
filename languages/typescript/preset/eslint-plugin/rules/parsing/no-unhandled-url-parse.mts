import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf, type SourceCode } from '../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';

type Candidate = { readonly node: TSESTree.NewExpression; readonly argument: TSESTree.Node };
type Guard = { readonly text: string; readonly scope: TSESTree.Node | undefined };

const MAX_PARTS = 100;
const PARSED_MEMBERS = new Set(['href', 'url', 'origin']);
const NAMED_FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

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
    pending.push(...parts);
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

function inBlock(block: TSESTree.Node, node: TSESTree.Node): boolean {
  return block.range[0] <= node.range[0] && node.range[1] <= block.range[1];
}

function isInsideTry(node: TSESTree.Node): boolean {
  const scope = ancestorsOf(node).find((ancestor) => NAMED_FUNCTIONS.has(ancestor.type));
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.TryStatement &&
      ancestor.handler !== null &&
      inBlock(ancestor.block, node) &&
      (scope === undefined || inBlock(scope, ancestor)),
  );
}

function functionOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(
    (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
  );
}

function isGuarded(
  sourceCode: SourceCode,
  candidate: Candidate,
  guards: readonly Guard[],
): boolean {
  const text = sourceCode.getText(unwrapOf(candidate.argument, ASSERTION_FORMS));
  const scopes = new Set<TSESTree.Node | undefined>([
    candidate.node,
    ...ancestorsOf(candidate.node),
  ]);
  return guards.some((guard) => guard.text === text && scopes.has(guard.scope));
}

export const rule: TSESLint.RuleModule<'unhandledUrlParse'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require new URL(text) on runtime text to be checked with URL.canParse, parsed with URL.parse, or wrapped in a try',
    },
    schema: [],
    messages: {
      unhandledUrlParse:
        'Parse this text with `URL.parse(text)` (null when it is not a URL), check `URL.canParse(text)` first, or build the URL in a `try` whose catch handles the failure. `new URL(text)` throws a TypeError on text that is not an absolute URL (no scheme, a bad host, `//` against a base), so one odd stored, user or header value turns this call into an error response. Constant text and a base are fine, and so are a `URL` value, an already parsed `.href`, `.url` or `.origin`, and `new URL(path, import.meta.url)`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const candidates: Candidate[] = [];
    const guards: Guard[] = [];

    return {
      NewExpression(node: TSESTree.NewExpression) {
        const [argument, base] = node.arguments;
        if (
          !isUrlConstructor(node.callee) ||
          argument === undefined ||
          argument.type === AST_NODE_TYPES.SpreadElement ||
          isModuleBase(context, base) ||
          (isSafeText(context, argument) && (base === undefined || isSafeText(context, base))) ||
          isInsideTry(node)
        ) {
          return;
        }
        candidates.push({ node, argument });
      },
      CallExpression(node: TSESTree.CallExpression) {
        const [argument] = node.arguments;
        if (isCanParse(node) && argument !== undefined) {
          guards.push({
            text: sourceCode.getText(unwrapOf(argument, ASSERTION_FORMS)),
            scope: functionOf(node),
          });
        }
      },
      'Program:exit'() {
        for (const candidate of candidates) {
          if (!isGuarded(sourceCode, candidate, guards)) {
            context.report({ node: candidate.node, messageId: 'unhandledUrlParse' });
          }
        }
      },
    };
  },
};
