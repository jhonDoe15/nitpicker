import { RULES_TOOL } from './tool.mjs';

export const ALIAS_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['forwarding-method-alias'],
    describe: (subject) => {
      const [name, target] = subject.split(' -> ');
      return `\`${name}\` only forwards its parameters to \`${target}\` and has the same signature`;
    },
    allowed: (subject) => `Call \`${subject.split(' -> ')[1]}\` directly and delete the alias.`,
  },
];
