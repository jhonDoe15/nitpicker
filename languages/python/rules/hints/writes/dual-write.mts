import { RULES_TOOL } from '../tool.mts';
import { parseEffect, pathPhrase, splitPath } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

function describe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [written = '<write>', sent = '<publish>', variant] = fields;
  const [table = ''] = path;
  const windows =
    variant === 'on-commit'
      ? 'publishing after the commit avoids a message for a rolled-back change, but a crash right after the commit loses the message'
      : 'the message can be sent for a change that is rolled back, or the change can commit and the message never be sent';
  return `\`${table}\` writes to the database with ${pathPhrase(splitPath(written))} and publishes a message with ${pathPhrase(splitPath(sent))} in two separate steps: ${windows}`;
}

export const DUAL_WRITE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['dual-write-without-outbox'],
    describe,
    allowed:
      'Write an outbox row in the same transaction as the change (a database write only) and let a relay publish it: a function that reads the unsent outbox rows, publishes each and then marks that row sent is the relay and is not reported. Change data capture and a database-backed queue give the same guarantee.',
  },
];
