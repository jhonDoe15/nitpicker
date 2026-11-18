import type { TSESLint } from '@typescript-eslint/utils';
import {
  cookiePrefix,
  extensionLookup,
  handSplit,
  nameLookup,
  valueComparison,
} from './header-forms.mts';
import type { HttpMessageId } from './origins/http-origins.mts';
import { urlCase } from './url-parts.mts';

const PARSER_ROUTE =
  'a parser: the `content-type`, `negotiator`, `accepts` or `cookie` package, or the framework helper (`req.accepts`, `req.is`, `c.req.parseBody`)';

export const rule: TSESLint.RuleModule<HttpMessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow comparing header values, cookie prefixes and file extensions by exact case, and splitting structured headers by hand',
    },
    schema: [],
    messages: {
      valueCase: `The \`{{ header }}\` header value is compared as exact text, but media types, charsets, encodings and schemes are case-insensitive, so \`Application/JSON\` or \`HTTPS\` is missed. Lowercase it first (\`value.toLowerCase()\`), or use ${PARSER_ROUTE}.`,
      nameCase:
        "`headers['{{ name }}']` looks the header up by exact text, but Node lowercases the names of the request's `headers` object, so this finds nothing. Read `headers['{{ lower }}']`, or use `Headers` and `.get()`, which ignore case.",
      handSplit: `The \`{{ header }}\` header is split or matched by hand, which breaks on quoted values, whitespace around separators and quality weights. Use ${PARSER_ROUTE}. An exception fits only the library that is itself the parser.`,
      cookiePrefix:
        'Cookie name prefixes are case-insensitive, so this exact-case check misses `__host-id`. Lowercase the name first (`name.toLowerCase().startsWith("__host-")`), or use the cookie helper of the framework.',
      urlCase:
        'The `{{ part }}` of a `URL` is already lower case, so a literal with capitals never matches. Compare with the lower-case text (`url.protocol === "https:"`).',
      extensionCase:
        'File extensions are case-insensitive, so `PHOTO.PNG` misses this MIME table. Lowercase the extension first (`extname(file).toLowerCase()`), or look it up with the `mime` package.',
    },
  },
  create(context) {
    function report(found: TSESLint.ReportDescriptor<HttpMessageId> | undefined): void {
      if (found !== undefined) {
        context.report(found);
      }
    }
    return {
      CallExpression(call) {
        report(
          urlCase(context, call) ??
            handSplit(context, call) ??
            valueComparison(context, call) ??
            cookiePrefix(call) ??
            extensionLookup(context, call),
        );
      },
      MemberExpression(member) {
        report(
          nameLookup(context, member) ??
            valueComparison(context, member) ??
            extensionLookup(context, member),
        );
      },
      BinaryExpression(binary) {
        report(
          urlCase(context, binary) ??
            valueComparison(context, binary) ??
            nameLookup(context, binary),
        );
      },
      SwitchStatement(statement) {
        report(valueComparison(context, statement));
      },
    };
  },
};
