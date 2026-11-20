import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import {
  CONSTANT_NAME,
  isEncodedText,
  isPlainValue,
  isUrlConstructor,
  lastNameOf,
  leafNamesOf,
  quasiText,
} from './url-values.mts';

type MessageId = 'queryValue' | 'pathSegment' | 'appendedQuery' | 'relativeStart' | 'credentials';
type Report = { readonly node: TSESTree.Node; readonly messageId: MessageId };
type RuleContext = Readonly<TSESLint.RuleContext<MessageId, []>>;

const QUERY_VALUE_START = /[?&][^\s?&=#/]+=$/u;
const SCHEME_START = /^(?:[a-z][a-z\d+.-]*:)?\/\//iu;
const CREDENTIAL_SCHEME =
  /(?:postgres(?:ql)?|mysql|mariadb|rediss?|mongodb(?:\+srv)?|amqps?):\/\/$/iu;
const URL_NAME = /(?:url|uri|endpoint|origin|host)s?$|^api/iu;
const SEGMENT_NAME =
  /(?:branch|ref|tag|title|username|filename|label|query|search|term|keyword|message|email|token)$|^q$/iu;
const QUERY_NAME = new RegExp(
  '(?:branch|ref|tag|title|username|filename|label|query|search|term|keyword|message|email|url|uri|' +
    'href|link|path|redirect|callback|returnTo|next|error|description|reason|text)s?$|^q$',
  'iu',
);
const SLASH_KEEPING_SEGMENT = new RegExp(
  '\\/(?:blob|tree|src|raw|commits?|blame|browse|heads|tags?|refs|-|branch|_edit|archive|' +
    'contents|tar\\.gz|zipball)\\/$',
  'iu',
);
const CREDENTIAL_NAME = /(?:user|username|login|password|passwd|pwd)$/iu;
const LINK_NAME = /(?:action|callback|redirect)(?:url|uri|to)?$|returnTo$/iu;
const FIXED_BASE_NAME = /^(?:base|api|origin|host|root|site|app|server|endpoint|public)/iu;
const MOCK_FILE = /__mocks__|\.mock\./u;
const PATH_NAME = /(?:path|pathname|route)$/iu;

function isOpen(context: RuleContext, node: TSESTree.Node): boolean {
  return !(isPlainValue(node) || isEncodedText(context.sourceCode.getText(node)));
}

function looksLikeUrl(template: TSESTree.TemplateLiteral): boolean {
  const texts = template.quasis.map((_, index) => quasiText(template, index));
  const [first = ''] = texts;
  const anchored =
    SCHEME_START.test(first) ||
    (first === '' && URL_NAME.test(lastNameOf(template.expressions[0] ?? template) ?? ''));
  return !texts.some((text) => /\s/u.test(text)) && (anchored || QUERY_VALUE_START.test(first));
}

function queryReports(context: RuleContext, template: TSESTree.TemplateLiteral): Report[] {
  return template.expressions.flatMap((expression, index) =>
    QUERY_VALUE_START.test(quasiText(template, index)) &&
    leafNamesOf(expression).some((name) => QUERY_NAME.test(name)) &&
    isOpen(context, expression)
      ? [{ node: expression, messageId: 'queryValue' as const }]
      : [],
  );
}

function segmentReports(context: RuleContext, template: TSESTree.TemplateLiteral): Report[] {
  const [first = ''] = template.quasis.map((_, index) => quasiText(template, index));
  const anchored =
    SCHEME_START.test(first) ||
    URL_NAME.test(lastNameOf(template.expressions[0] ?? template) ?? '');
  return template.expressions.flatMap((expression, index) =>
    anchored &&
    index > 0 &&
    quasiText(template, index).endsWith('/') &&
    leafNamesOf(expression).some((name) => SEGMENT_NAME.test(name)) &&
    !SLASH_KEEPING_SEGMENT.test(quasiText(template, index)) &&
    isOpen(context, expression)
      ? [{ node: expression, messageId: 'pathSegment' as const }]
      : [],
  );
}

function isQueryFree(context: RuleContext, base: TSESTree.Node | undefined): boolean {
  const value = base === undefined ? undefined : resolveConstant(context, base);
  if (value?.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.quasis.every((_, index) => !quasiText(value, index).includes('?'));
  }
  const text = stringValue(value);
  return text !== undefined && !text.includes('?');
}

function appendedQuery(context: RuleContext, template: TSESTree.TemplateLiteral): Report[] {
  const [base] = template.expressions;
  const names = base === undefined ? [] : leafNamesOf(base);
  return quasiText(template, 0) === '' &&
    quasiText(template, 1).startsWith('?') &&
    names.some((name) => LINK_NAME.test(name)) &&
    !names.some((name) => FIXED_BASE_NAME.test(name) || CONSTANT_NAME.test(name)) &&
    !isQueryFree(context, base)
    ? [{ node: template, messageId: 'appendedQuery' }]
    : [];
}

function credentialReports(context: RuleContext, template: TSESTree.TemplateLiteral): Report[] {
  return template.expressions.flatMap((expression, index) => {
    const tail = quasiText(template, index);
    const user = CREDENTIAL_SCHEME.test(tail) && CREDENTIAL_NAME.test(lastNameOf(expression) ?? '');
    const password = template.expressions[index + 1];
    const followed =
      user && quasiText(template, index + 1) === ':' && password !== undefined ? [password] : [];
    return [...(user ? [expression] : []), ...followed]
      .filter((value) => isOpen(context, value))
      .slice(0, 1)
      .map((node) => ({ node, messageId: 'credentials' as const }));
  });
}

function isParsedPathname(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    lastNameOf(node) === 'pathname' &&
    /url|uri/iu.test(lastNameOf(node.object) ?? '')
  );
}

function relativeStart(node: TSESTree.NewExpression): Report[] {
  const [target, base] = node.arguments;
  const [first] = target?.type === AST_NODE_TYPES.TemplateLiteral ? target.expressions : [];
  return target?.type === AST_NODE_TYPES.TemplateLiteral &&
    base !== undefined &&
    isUrlConstructor(node.callee) &&
    quasiText(target, 0) === '' &&
    first !== undefined &&
    PATH_NAME.test(lastNameOf(first) ?? '') &&
    !FIXED_BASE_NAME.test(lastNameOf(first) ?? '') &&
    !isParsedPathname(first)
    ? [{ node: target, messageId: 'relativeStart' }]
    : [];
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require values put into a URL template to be encoded, and bases to be joined with URL',
    },
    schema: [],
    messages: {
      queryValue:
        'Encode this query value with `encodeURIComponent(value)`, or build the URL with ' +
        '`url.searchParams.set(name, value)`. A value with `&`, `#`, `+` or non-ASCII text ' +
        'changes the URL.',
      pathSegment:
        'Encode this path segment with `encodeURIComponent(value)`: a value with `/`, `?`, `#` ' +
        'or `..` changes the route. Encode a key that keeps its slashes per segment.',
      appendedQuery:
        'This appends `?` to a URL that may already carry a query. Build it with ' +
        '`const url = new URL(base); url.searchParams.set(name, value)`.',
      relativeStart:
        'A path that starts with `//` passed to `new URL(path, base)` replaces the host. ' +
        'Reject a path that does not start with a single `/` before building the URL.',
      credentials:
        'Encode a user name or password put into a connection URL with ' +
        '`encodeURIComponent(value)`: `@`, `:`, `/` and `#` in it change the host.',
    },
  },
  create(context) {
    if (MOCK_FILE.test(context.filename)) {
      return {};
    }

    function check(template: TSESTree.TemplateLiteral) {
      if (template.parent.type === AST_NODE_TYPES.TaggedTemplateExpression) {
        return;
      }
      const found = [
        ...credentialReports(context, template),
        ...appendedQuery(context, template),
        ...(looksLikeUrl(template)
          ? [...queryReports(context, template), ...segmentReports(context, template)]
          : []),
      ];
      const [report] = found;
      if (report !== undefined) {
        context.report(report);
      }
    }

    return {
      TemplateLiteral: check,
      NewExpression(node: TSESTree.NewExpression) {
        const [report] = relativeStart(node);
        if (report !== undefined) {
          context.report(report);
        }
      },
    };
  },
};
