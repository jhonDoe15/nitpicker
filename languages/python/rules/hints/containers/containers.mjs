import { RULES_TOOL } from '../tool.mjs';

const EXCEPTION =
  'An exception fits only for a list that always stays a handful of items, or items that cannot be hashed.';

function lookupParts(subject = 'the list:.key') {
  const separator = subject.indexOf(':');
  return { receiver: subject.slice(0, separator), key: subject.slice(separator + 1) };
}

export const CONTAINER_HINTS = [
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
];
