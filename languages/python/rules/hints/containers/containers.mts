import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const EXCEPTION =
  'An exception fits only for a list that always stays a handful of items, or items that cannot be hashed.';

function lookupParts(subject = 'the list:.key') {
  const separator = subject.indexOf(':');
  return { receiver: subject.slice(0, separator), key: subject.slice(separator + 1) };
}

function nullKeyDescribe(subject = ''): string {
  const [form = '', text = subject, number] = subject.split('|');
  if (form === 'in') {
    return `\`${text}\` is also true when the key is present with \`null\`, and the read after it then gets \`None\``;
  }
  if (form === 'setdefault') {
    return `\`${text}\` stores the default only when the key is missing: a key present with \`null\` keeps \`None\``;
  }
  const zero =
    number === undefined
      ? ''
      : ', and `or 0` would also replace a real `0`, so test for `None` instead';
  return `\`${text}\` falls back to its default only when the key is missing: a key sent with \`null\` returns \`None\`, which then reaches code that expects a value${zero}`;
}

export const CONTAINER_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['list-used-as-set'],
    describe: (subject) =>
      `\`${subject}\` gets \`append\` and is searched with \`in\` inside a loop or a nested function, so every search scans the whole list`,
    allowed: `Keep it in a \`set()\` (\`add\`, \`in\`), or a \`dict\` used as an ordered set when the order matters (\`seen[item] = None\`, \`list(seen)\`). ${EXCEPTION}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['linear-lookup-in-loop'],
    describe: (subject) =>
      `\`${lookupParts(subject).receiver}\` is scanned for one \`item${lookupParts(subject).key}\` on every pass of the loop, and it does not change in between`,
    allowed: (subject) =>
      `Build a \`dict\` once before the loop (\`{item${lookupParts(subject).key}: item for item in ${lookupParts(subject).receiver}}\`) and use \`get\` or \`in\`. ${EXCEPTION}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['null-valued-input-key'],
    describe: nullKeyDescribe,
    allowed:
      'Treat a null value like a missing key. Use `body.get("alt") or ""` only when the default is the empty value of the type (`""`, `[]`, `{}`); where `0` or `False` is a valid value, test `value if (value := body.get("n")) is not None else 0`. Replace `"k" in body` by `body.get("k") is not None`. A pydantic model or `TypedDict` that rejects null states it once.',
  },
];
