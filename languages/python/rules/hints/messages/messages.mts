import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

function unformattedDescribe(subject: string): string {
  return `\`${subject}\` is typed inside a plain string that nothing formats, so the message keeps the braces and loses the value it was meant to show`;
}

function argumentsDescribe(subject: string): string {
  const [name = ''] = subject.split('|');
  return `\`${name}\` is built like a logger call: it stores the message and the extra arguments as a tuple and never formats them, so the text keeps its placeholder and the traceback prints the tuple`;
}

export const MESSAGE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['unformatted-message-placeholder'],
    describe: unformattedDescribe,
    allowed:
      'Make the string an f-string (`f"Path {url.path} is not supported"`), or format it: `"Path {} bad".format(path)`, `"Path %s bad" % path`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['exception-format-arguments'],
    describe: argumentsDescribe,
    allowed:
      'Format the text before building the exception: `raise ValueError(f"path {path} not found")`, or `"path %s not found" % path`, or `.format(path)`.',
  },
];
