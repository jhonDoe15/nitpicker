import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import {
  ASSERTION_FORMS,
  NULLISH_WRAPPERS,
  isFunction,
  unwrapOf,
} from '../../typed/syntax-views.mts';
import { isUrlConstructor, quasiText } from './url-values.mts';

const LOCATION = 'location';

type MessageId = typeof LOCATION | 'redirect' | 'relative';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const REQUEST_FUNCTIONS = new Set(['fetch', 'got', 'axios', 'ofetch', 'ky']);
const REQUEST_OWNERS = new Set([
  'http',
  'https',
  'axios',
  'got',
  'ky',
  'undici',
  'ofetch',
  'client',
]);
const REQUEST_METHODS = new Set(['get', 'request', 'post', 'head', 'fetch']);
const REDIRECT_OWNERS = new Set(['Response', 'NextResponse']);
const MAX_DEPTH = 5;
const ABSOLUTE_CHECK = /\^https\?|startsWith\(['"]https?|isAbsolute|canParse|URL\.parse/u;

function isLocationKey(node: TSESTree.Node): boolean {
  const key = stringValue(node) ?? nameOf(node);
  return key?.toLowerCase() === LOCATION;
}

function isHeadersObject(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, NULLISH_WRAPPERS);
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    nameOf(value.property) === 'headers'
  );
}

function headerRead(value: TSESTree.MemberExpression): boolean {
  return (
    isHeadersObject(value.object) &&
    (value.computed
      ? isLocationKey(value.property)
      : nameOf(value.property)?.toLowerCase() === LOCATION)
  );
}

function headerCall(value: TSESTree.CallExpression): boolean {
  const { callee } = value;
  const [key] = value.arguments;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    ['get', 'getHeader'].includes(nameOf(callee.property) ?? '') &&
    key !== undefined &&
    isLocationKey(key) &&
    (isHeadersObject(callee.object) || nameOf(callee.property) === 'getHeader')
  );
}

function bindingStep(context: Context, node: TSESTree.Identifier): TSESTree.Node | boolean {
  const [definition] = findVariable(context, node, node.name)?.defs ?? [];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable || !definition.node.init) {
    return false;
  }
  const { id, init } = definition.node;
  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    return (
      isHeadersObject(init) &&
      id.properties.some(
        (property) =>
          property.type === AST_NODE_TYPES.Property &&
          isLocationKey(property.key) &&
          property.value.type === AST_NODE_TYPES.Identifier &&
          property.value.name === node.name,
      )
    );
  }
  return id.type === AST_NODE_TYPES.Identifier ? init : false;
}

function locationStep(context: Context, value: TSESTree.Node): TSESTree.Node | boolean {
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return headerRead(value);
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return headerCall(value);
  }
  return value.type === AST_NODE_TYPES.Identifier ? bindingStep(context, value) : false;
}

function isLocationRead(context: Context, node: TSESTree.Node): boolean {
  const pending = [{ node, depth: 0 }];
  for (const item of pending) {
    if (item.depth > MAX_DEPTH) {
      return false;
    }
    const step = locationStep(context, unwrapOf(item.node, NULLISH_WRAPPERS));
    if (typeof step === 'boolean') {
      return step;
    }
    pending.push({ node: step, depth: item.depth + 1 });
  }
  return false;
}

function enclosingFunctionName(node: TSESTree.Node): string | undefined {
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor.type === AST_NODE_TYPES.FunctionDeclaration) {
      return ancestor.id?.name;
    }
    if (
      (ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        ancestor.type === AST_NODE_TYPES.FunctionExpression) &&
      ancestor.parent.type === AST_NODE_TYPES.VariableDeclarator
    ) {
      return nameOf(ancestor.parent.id);
    }
  }
  return undefined;
}

function isRequestCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return REQUEST_FUNCTIONS.has(callee.name) || callee.name === enclosingFunctionName(node);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    REQUEST_METHODS.has(nameOf(callee.property) ?? '') &&
    REQUEST_OWNERS.has(nameOf(callee.object) ?? '')
  );
}

function isRelativeText(context: Context, node: TSESTree.Node): boolean {
  const value = unwrapOf(resolveConstant(context, node) ?? node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    const [first] = value.expressions;
    return (
      quasiText(value, 0).startsWith('/') ||
      (quasiText(value, 0) === '' &&
        first?.type === AST_NODE_TYPES.MemberExpression &&
        nameOf(first.object) === 'pages')
    );
  }
  return stringValue(value)?.startsWith('/') ?? false;
}

function checksAbsolute(context: Context, node: TSESTree.Node): boolean {
  const scope = ancestorsOf(node).find(isFunction) ?? context.sourceCode.ast;
  return ABSOLUTE_CHECK.test(context.sourceCode.getText(scope));
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a Location header or a path to be resolved against a base before use',
    },
    schema: [],
    messages: {
      location:
        'A `Location` header may be a path (`/v2/file`). Resolve it against the request URL ' +
        'first: `new URL(location, requestUrl)`.',
      redirect:
        '`Response.redirect` needs an absolute URL, and this value is a path. Resolve it ' +
        'against the request URL: `Response.redirect(new URL(path, request.url))`.',
      relative:
        '`new URL(path)` with one argument throws `Invalid URL` for a path. Pass the base: ' +
        '`new URL(path, base)`.',
    },
  },
  create(context) {
    return {
      NewExpression(node: TSESTree.NewExpression) {
        const [argument] = node.arguments;
        if (
          !isUrlConstructor(node.callee) ||
          node.arguments.length !== 1 ||
          argument === undefined
        ) {
          return;
        }
        if (isLocationRead(context, argument)) {
          if (!checksAbsolute(context, node)) {
            context.report({ node, messageId: LOCATION });
          }
        } else if (isRelativeText(context, argument)) {
          context.report({ node, messageId: 'relative' });
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        const [argument] = node.arguments;
        const { callee } = node;
        if (argument === undefined || argument.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }
        if (
          isRequestCall(node) &&
          isLocationRead(context, argument) &&
          !checksAbsolute(context, node)
        ) {
          context.report({ node, messageId: LOCATION });
        } else if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          nameOf(callee.property) === 'redirect' &&
          REDIRECT_OWNERS.has(nameOf(callee.object) ?? '') &&
          isRelativeText(context, argument)
        ) {
          context.report({ node, messageId: 'redirect' });
        }
      },
    };
  },
};
