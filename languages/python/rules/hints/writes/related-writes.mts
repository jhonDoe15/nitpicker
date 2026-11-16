import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

const WRITE = '<write>';
const FUNCTION = '<function>';

function outsideDescribe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [write = WRITE, block = '<transaction>'] = fields;
  return `\`${path[0] ?? FUNCTION}\` writes with \`${write}\` inside \`${block}\` through a session, connection or database alias that is not the block's: the write is not part of the transaction and commits or rolls back on its own`;
}

function splitDescribe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [first = WRITE, second = WRITE] = fields;
  return `\`${path[0] ?? FUNCTION}\` writes with \`${first}\` and then with \`${second}\` outside one transaction: a crash or a concurrent request between the writes leaves half-written state`;
}

function raceDescribe(subject: string): string {
  const { path, fields } = parseEffect(subject);
  const [read = '<read>', write = WRITE] = fields;
  return `\`${path[0] ?? FUNCTION}\` reads with \`${read}\` and decides on \`${write}\` outside a transaction and without a lock: two callers can both pass the check before either writes`;
}

export const RELATED_WRITE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['write-outside-transaction'],
    describe: outsideDescribe,
    allowed:
      'Write through the session or connection the block opened (`session.add(...)` inside `with session.begin():`, the same `using=` alias inside `transaction.atomic(using=...)`), or move an independent write out of the block.',
  },
  {
    tool: RULES_TOOL,
    rules: ['related-writes-without-transaction'],
    describe: splitDescribe,
    allowed:
      'Run the related writes in one transaction so they commit or roll back together: `with session.begin():` in SQLAlchemy, `with transaction.atomic():` or `@transaction.atomic` in Django.',
  },
  {
    tool: RULES_TOOL,
    rules: ['check-then-write-race'],
    describe: raceDescribe,
    allowed:
      'Make the check and the write one atomic step: `get_or_create`, `update_or_create` or an `INSERT ... ON CONFLICT` with a unique constraint, or take a row lock inside one transaction (`select_for_update()` in Django, `with_for_update()` in SQLAlchemy).',
  },
];
