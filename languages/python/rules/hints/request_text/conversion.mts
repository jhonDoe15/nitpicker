import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const REQUEST_CONVERSION_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['unchecked-request-conversion'],
    describe: (subject) =>
      `\`${subject}\` parses untrusted request, route or header text without catching malformed input, ` +
      `so a bad value raises an unhandled error and turns client input into a 500`,
    allowed:
      'Catch the conversion error (`try: ... except ValueError:` for `UUID`/`int`/`float`, ' +
      '`except InvalidOperation:` for `Decimal`, `except ValidationError:` for a Django `UUIDField` lookup) ' +
      'and return a 400 response; or use a typed route converter (`<uuid:pk>`, `pk: UUID`, `page: int`), ' +
      'a validated serializer or Pydantic model, or pre-check the text (`.isdigit()`).',
  },
];
