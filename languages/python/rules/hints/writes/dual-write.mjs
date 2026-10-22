import { RULES_TOOL } from '../tool.mjs';

function describe(subject = '') {
  const [fn, written, sent, variant] = subject.split('|');
  const windows =
    variant === 'on-commit'
      ? 'publishing after the commit avoids a message for a rolled-back change, but a crash right after the commit loses the message'
      : 'the message can be sent for a change that is rolled back, or the change can commit and the message never be sent';
  return `\`${fn}\` writes to the database (\`${written}\`) and publishes a message (\`${sent}\`) in two separate steps: ${windows}`;
}

export const DUAL_WRITE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['dual-write-without-outbox'],
    describe,
    allowed:
      'Write an outbox row in the same transaction as the change (a database write only) and let a relay process publish it; change data capture and a database-backed queue give the same guarantee.',
  },
];
