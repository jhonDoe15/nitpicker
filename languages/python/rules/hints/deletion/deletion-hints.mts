import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

type Details = {
  readonly name: string;
  readonly target: string;
  readonly field: string;
  readonly via: string;
  readonly share: string;
};

function detailsOf(target: string, flag: string): (subject: string) => Details {
  return (subject) => {
    const { path, fields } = parseEffect(subject);
    const [read = target, field = flag, via = field, share = 'most'] = fields;
    const [name = '<function>'] = path;
    return { name, target: read, field, via, share };
  };
}

const rowDetails = detailsOf('<model>', '<column>');
const itemDetails = detailsOf('<type>', '<flag>');

export const SOFT_DELETE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['soft-delete-filter-missing'],
    describe: (subject) => {
      const { name, target, field, via, share } = rowDetails(subject);
      return `\`${name}\` reads \`${target}\` without the filter on \`${field}\` that ${share} of the project's \`${target}\` reads apply (\`${via}\`): deleted or hidden rows reach the caller`;
    },
    allowed: (subject) =>
      `Apply the filter the other reads use (\`${rowDetails(subject).via}\`) to this query. A query that reads deleted rows on purpose (trash, restore, purge, admin, cleanup) belongs in an exception with that reason.`,
  },
];

export const DELETED_ITEM_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['deleted-item-filter-missing'],
    describe: (subject) => {
      const { name, target, field, via, share } = itemDetails(subject);
      return `\`${name}\` goes over a collection of \`${target}\` without skipping items flagged by \`${field}\`, which ${share} of the project's iterations over \`${target}\` do (\`${via}\`): deleted items take part in the result`;
    },
    allowed: (subject) =>
      `Skip the flagged items the way the other code does (\`${itemDetails(subject).via}\`: a guard on the flag, the project's helper, or the narrowed type). Code that reads deleted items on purpose (undo, restore, trash, sync) belongs in an exception with that reason.`,
  },
];
