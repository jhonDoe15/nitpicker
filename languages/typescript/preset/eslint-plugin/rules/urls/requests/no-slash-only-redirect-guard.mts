import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { syntaxChildren } from '../../decided/syntax.mts';
import { ancestorsOf, depthFirst, nameOf, type SourceCode } from '../../typed/node-views.mts';
import {
  ASSERTION_FORMS,
  NULLISH_WRAPPERS,
  isFunction,
  operandsOf,
  unwrapOf,
} from '../../typed/syntax-views.mts';
import { lastNameOf } from '../construction/url-values.mts';
import { statementsAfter } from '../following-statements.mts';

type MessageId = 'slashOnly' | 'pathname';
type RuleContext = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Guard = { readonly target: TSESTree.Node; readonly test: TSESTree.Node };

const TARGET_NAME = new RegExp(
  '(?:callback|redirect|return|next|continue|target|destination|goto|success)' +
    '(?:url|uri|to|path)?$|^(?:from|callback)$',
  'iu',
);
const BARE_SLASH_PATTERNS = new Set([
  '^\\/',
  '^\\/.*',
  '^\\/.+',
  '^\\/\\S*',
  '^\\/\\S+',
  '^\\/.*$',
  '^\\/\\S*$',
]);
const DOUBLE_SLASH_CHECK =
  /['"`]\/\/['"`]|startsWith\(['"`]\/\/|['"`]\\\\+['"`]|%2f|%5c|\\\/\\\/|\(\?!|\[\^\/|\[\^\\\//iu;
const HELPER_CHECK = new RegExp(
  '\\b(?:isSafe|isValid|isAllowed|isLocal|isRelative|sanitiz|safeRedirect|validateRedirect)' +
    '\\w*\\(|new URL\\(|\\.origin\\b',
  'iu',
);
const SAME_ORIGIN_CHECK = /\.origin\b/u;
const REDIRECT_CALLS = new Set(['redirect', 'permanentRedirect', 'navigate', 'redirectTo']);
const ROUTER_METHODS = new Set(['push', 'replace', 'assign']);
const ROUTER_OWNER = /router|history|navigat|location/iu;

function isSlash(node: TSESTree.Node | undefined): boolean {
  return node !== undefined && stringValue(node) === '/';
}

function testedTarget(value: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = value;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property);
  if (method === 'startsWith' && isSlash(value.arguments[0])) {
    return callee.object;
  }
  const { object } = callee;
  const pattern =
    object.type === AST_NODE_TYPES.Literal && 'regex' in object ? object.regex.pattern : undefined;
  return method === 'test' && pattern !== undefined && BARE_SLASH_PATTERNS.has(pattern)
    ? value.arguments[0]
    : undefined;
}

function comparedTarget(value: TSESTree.BinaryExpression): TSESTree.Node | undefined {
  const read = isSlash(value.right) ? value.left : isSlash(value.left) ? value.right : undefined;
  const inner = read === undefined ? undefined : unwrapOf(read, NULLISH_WRAPPERS);
  if (inner?.type === AST_NODE_TYPES.MemberExpression && inner.computed) {
    return stringValue(inner.property) === undefined && nameOf(inner.property) === undefined
      ? inner.object
      : undefined;
  }
  return inner?.type === AST_NODE_TYPES.CallExpression &&
    inner.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(inner.callee.property) === 'charAt'
    ? inner.callee.object
    : undefined;
}

function slashGuardTarget(node: TSESTree.Node): TSESTree.Node | undefined {
  const value = unwrapOf(node, NULLISH_WRAPPERS);
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return testedTarget(value);
  }
  return value.type === AST_NODE_TYPES.BinaryExpression && ['===', '=='].includes(value.operator)
    ? comparedTarget(value)
    : undefined;
}

function isSink(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return REDIRECT_CALLS.has(callee.name);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property) ?? '';
  const owner = lastNameOf(callee.object) ?? '';
  return (
    REDIRECT_CALLS.has(method) ||
    (method === 'redirect' && owner !== '') ||
    (ROUTER_METHODS.has(method) && ROUTER_OWNER.test(owner))
  );
}

function flowsTarget(context: RuleContext, node: TSESTree.Node, text: string): boolean {
  const { sourceCode } = context;
  const mentions = (part: TSESTree.Node) => sourceCode.getText(part).includes(text);
  if (node.type === AST_NODE_TYPES.ReturnStatement) {
    return node.argument !== null && mentions(node.argument);
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression && isSink(node) && node.arguments.some(mentions)
  );
}

function usesTarget(context: RuleContext, region: TSESTree.Node, text: string): boolean {
  return (
    [...depthFirst<TSESTree.Node>(region, syntaxChildren)].some((current) =>
      flowsTarget(context, current, text),
    ) ||
    (region.type !== AST_NODE_TYPES.BlockStatement &&
      context.sourceCode.getText(region).includes(text))
  );
}

function pathnameSink(
  context: RuleContext,
  node: TSESTree.CallExpression,
): TSESTree.Node | undefined {
  const [argument] = node.arguments;
  if (!isSink(node) || argument === undefined || argument.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  let leading: TSESTree.Node | undefined = argument;
  while (leading?.type === AST_NODE_TYPES.BinaryExpression) {
    leading = leading.left;
  }
  const first = leading?.type === AST_NODE_TYPES.TemplateLiteral ? leading.expressions[0] : leading;
  const value = first === undefined ? undefined : unwrapOf(first, ASSERTION_FORMS);
  if (value?.type !== AST_NODE_TYPES.MemberExpression || nameOf(value.property) !== 'pathname') {
    return undefined;
  }
  const parsed = resolveConstant(context, value.object);
  return parsed?.type === AST_NODE_TYPES.NewExpression &&
    parsed.callee.type === AST_NODE_TYPES.Identifier &&
    parsed.callee.name === 'URL' &&
    parsed.arguments[0] !== undefined
    ? argument
    : undefined;
}

function scopeText(sourceCode: SourceCode, node: TSESTree.Node): string {
  return sourceCode.getText(ancestorsOf(node).find(isFunction) ?? sourceCode.ast);
}

function guardsIn(test: TSESTree.Node): Guard[] {
  return operandsOf(test, '&&').flatMap((part) => {
    const target = slashGuardTarget(part);
    return target === undefined ? [] : [{ target, test: part }];
  });
}

function reportGuards(context: RuleContext, guards: readonly Guard[], region: TSESTree.Node) {
  const { sourceCode } = context;
  for (const guard of guards) {
    const guardScope = scopeText(sourceCode, guard.test);
    if (
      TARGET_NAME.test(lastNameOf(guard.target) ?? '') &&
      !DOUBLE_SLASH_CHECK.test(guardScope) &&
      !HELPER_CHECK.test(guardScope) &&
      usesTarget(context, region, sourceCode.getText(guard.target))
    ) {
      context.report({ node: guard.test, messageId: 'slashOnly' });
    }
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a redirect target accepted as same-site only because it starts with a slash',
    },
    schema: [],
    messages: {
      slashOnly:
        'A target that starts with `/` can still be `//host` or `/\\host`, which browsers treat ' +
        'as another site. Resolve it against a fixed origin and compare the origin back ' +
        '(`new URL(value, base).origin === base`), or allow only exact paths.',
      pathname:
        'A same-origin pathname can still be `//host`, so redirecting to `pathname + search` ' +
        'can leave the site. Reject a pathname that starts with `//` or a backslash, or ' +
        'redirect to the resolved `URL` after comparing its origin.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const check = (guards: readonly Guard[], region: TSESTree.Node) =>
      reportGuards(context, guards, region);

    return {
      IfStatement(node: TSESTree.IfStatement) {
        check(guardsIn(node.test), node.consequent);
        const { test } = node;
        if (test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!') {
          const inner = guardsIn(test.argument);
          for (const statement of statementsAfter(node)) {
            check(inner, statement);
          }
        }
      },
      ConditionalExpression: (node: TSESTree.ConditionalExpression) =>
        check(guardsIn(node.test), node.consequent),
      LogicalExpression: (node: TSESTree.LogicalExpression) => {
        if (node.operator === '&&') {
          check(guardsIn(node.left), node.right);
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        const argument = pathnameSink(context, node);
        const text = scopeText(sourceCode, node);
        if (
          argument !== undefined &&
          SAME_ORIGIN_CHECK.test(text) &&
          !DOUBLE_SLASH_CHECK.test(text)
        ) {
          context.report({ node: argument, messageId: 'pathname' });
        }
      },
    };
  },
};
