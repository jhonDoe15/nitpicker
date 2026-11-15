import { RULES_TOOL } from '../tool.mjs';

export const HTTP_VALUE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['http-value-case'],
    describe: (subject) =>
      `\`${subject}\` compares exact text, but media types, charsets, encodings, hosts, cookie name prefixes and file extensions are case-insensitive, so \`Application/JSON\` or \`photo.PNG\` is missed`,
    allowed:
      'Normalise first (`value.lower()` or `value.casefold()`) and compare that, or parse it: `email.message.Message.get_content_type()` or `werkzeug.http.parse_options_header` for media types, `http.cookies.SimpleCookie` for cookies. Look a header up through the request mapping (`request.headers["content-type"]`), which ignores case, and key a MIME table by `suffix.lower()`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['hand-split-http-header'],
    describe: (subject) =>
      `\`${subject}\` splits a structured header by hand, which breaks on quoted values, whitespace around separators and quality weights`,
    allowed:
      'Parse it: `email.message.Message` (`get_content_type()`, `get_params()`), `werkzeug.http` (`parse_options_header`, `parse_accept_header`, `parse_cache_control_header`, `parse_etags`) or `http.cookies.SimpleCookie`. A library that is itself the parser takes an exception.',
  },
];
