import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { TYPE_WRAPPERS, isFunction, unwrapOf } from '../../typed/syntax-views.mts';
import { lastNameOf } from '../construction/url-values.mts';
import { assignmentSink, attributeSink, callSink, type Sink } from './link-sinks.mts';

type Context = Readonly<TSESLint.RuleContext<'unchecked', []>>;
type Guard = { readonly text: string; readonly scope: TSESTree.Node | undefined };

const URL_NAME = /(?:url|uri|website|homepage|address|redirect|returnTo)s?$|^(?:src|source)$/iu;
const SAFE_START = /^(?:https?:\/\/|\/(?!\/)|#|mailto:|tel:|\.{1,2}\/|\?)/iu;
const GUARD_WORDS = new RegExp(
  'protocol|http|sanitiz|isSafe|safeUrl|isHttp|isValidUrl|isUrl|allowedProtocols|canParse|' +
    'isAbsolute|URL\\.parse|new URL',
  'iu',
);
const MAIL_FILE = /(?:^|\/)(?:emails?|__mocks__)\//u;
const LIST_METHODS = new Set(['map', 'filter', 'forEach', 'flatMap', 'find', 'some']);
const WRAPPER_PROPS = new Set(['props', 'rest', 'other', 'others', 'restProps']);
const MAX_DEPTH = 5;

function startsSafely(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, TYPE_WRAPPERS);
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return value.operator === '+' && startsSafely(value.left);
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return SAFE_START.test(value.quasis[0]?.value.cooked ?? '');
  }
  return value.type === AST_NODE_TYPES.Literal && SAFE_START.test(String(value.value));
}

function rootOf(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const value = unwrapOf(node, TYPE_WRAPPERS);
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return rootOf(value.object);
  }
  return value.type === AST_NODE_TYPES.Identifier ? value : undefined;
}

function rootName(node: TSESTree.Node): string | undefined {
  return rootOf(node)?.name;
}

function isLiteralListItem(context: Context, node: TSESTree.Node): boolean {
  const root = rootOf(node);
  const [definition] = (root && findVariable(context, root, root.name)?.defs) ?? [];
  const call =
    definition?.type === TSESLint.Scope.DefinitionType.Parameter
      ? definition.node.parent
      : undefined;
  const list =
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    LIST_METHODS.has(nameOf(call.callee.property) ?? '')
      ? resolveConstant(context, call.callee.object)
      : undefined;
  return list?.type === AST_NODE_TYPES.ArrayExpression;
}

function isRuntimeValue(context: Context, node: TSESTree.Node, depth: number): boolean {
  const value = unwrapOf(node, TYPE_WRAPPERS);
  if (depth > MAX_DEPTH || startsSafely(value) || stringValue(value) !== undefined) {
    return false;
  }
  if (value.type === AST_NODE_TYPES.LogicalExpression) {
    return (
      isRuntimeValue(context, value.left, depth + 1) ||
      isRuntimeValue(context, value.right, depth + 1)
    );
  }
  if (value.type === AST_NODE_TYPES.ConditionalExpression) {
    return (
      isRuntimeValue(context, value.consequent, depth + 1) ||
      isRuntimeValue(context, value.alternate, depth + 1)
    );
  }
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    const root = rootName(value);
    return (
      root !== undefined &&
      !WRAPPER_PROPS.has(root) &&
      URL_NAME.test(lastNameOf(value) ?? '') &&
      !isLiteralListItem(context, value)
    );
  }
  return value.type === AST_NODE_TYPES.Identifier && isRuntimeName(context, value, depth);
}

function isRuntimeName(context: Context, node: TSESTree.Identifier, depth: number): boolean {
  const [definition] = findVariable(context, node, node.name)?.defs ?? [];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable || !URL_NAME.test(node.name)) {
    return false;
  }
  const { init, id } = definition.node;
  if (init === null || init === undefined) {
    return false;
  }
  if (id.type === AST_NODE_TYPES.Identifier) {
    const resolved = resolveConstant(context, node);
    return resolved !== node && isRuntimeValue(context, resolved ?? init, depth + 1);
  }
  const source = rootName(init);
  return (
    source !== undefined &&
    !WRAPPER_PROPS.has(source) &&
    init.type !== AST_NODE_TYPES.CallExpression
  );
}

function scopeOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(isFunction);
}

function isGuarded(context: Context, sink: Sink, guards: readonly Guard[]): boolean {
  const text = context.sourceCode.getText(unwrapOf(sink.value, TYPE_WRAPPERS));
  const scope = scopeOf(sink.value);
  return guards.some((guard) => guard.scope === scope && guard.text.includes(text));
}

export const rule: TSESLint.RuleModule<'unchecked'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a runtime URL used as a link, frame source or navigation target to be checked for an http(s) scheme',
    },
    schema: [],
    messages: {
      unchecked:
        'Check the scheme before this runtime URL becomes a link, frame source or navigation ' +
        'target: a `javascript:` or `data:` value runs script when clicked. Use one helper that ' +
        'parses with `URL.parse` and returns the URL only for `http:` and `https:`.',
    },
  },
  create(context) {
    if (MAIL_FILE.test(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    const sinks: Sink[] = [];
    const guards: Guard[] = [];

    function guard(test: TSESTree.Node) {
      const text = sourceCode.getText(test);
      if (GUARD_WORDS.test(text)) {
        guards.push({ text, scope: scopeOf(test) });
      }
    }

    function guardInit(init: TSESTree.Node | null) {
      if (init !== null) {
        guard(init);
      }
    }

    function add(sink: Sink | undefined) {
      if (sink !== undefined) {
        sinks.push(sink);
      }
    }

    return {
      JSXAttribute: (node: TSESTree.JSXAttribute) => add(attributeSink(node)),
      CallExpression: (node: TSESTree.CallExpression) => add(callSink(node)),
      AssignmentExpression: (node: TSESTree.AssignmentExpression) => add(assignmentSink(node)),
      VariableDeclarator: (node: TSESTree.VariableDeclarator) => guardInit(node.init),
      IfStatement: (node: TSESTree.IfStatement) => guard(node.test),
      ConditionalExpression: (node: TSESTree.ConditionalExpression) => guard(node.test),
      LogicalExpression: (node: TSESTree.LogicalExpression) => guard(node.left),
      'Program:exit'() {
        for (const sink of sinks) {
          if (isRuntimeValue(context, sink.value, 0) && !isGuarded(context, sink, guards)) {
            context.report({ node: sink.value, messageId: 'unchecked' });
          }
        }
      },
    };
  },
};
