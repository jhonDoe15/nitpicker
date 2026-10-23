import { RULES_TOOL } from '../tool.mjs';
import { parseEffect, pathPhrase, splitPath } from '../effects/subject.mjs';

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [written, sent, variant] = fields;
  const windows =
    variant === 'on-commit'
      ? 'publishing after the commit avoids a message for a rolled-back change, but a crash right after the commit loses the message'
      : 'the message can be sent for a change that is rolled back, or the change can commit and the message never be sent';
  return `\`${path[0]}\` writes to the database with ${pathPhrase(splitPath(written))} and publishes a message with ${pathPhrase(splitPath(sent))} in two separate steps: ${windows}`;
}

export const DUAL_WRITE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['dual-write-without-outbox'],
    describe,
    allowed:
      'Write an outbox row in the same transaction as the change (a database write only) and let a relay publish it: a function that reads the unsent outbox rows, publishes each and then marks that row sent is the relay and is not reported. Change data capture and a database-backed queue give the same guarantee.',
  },
];
