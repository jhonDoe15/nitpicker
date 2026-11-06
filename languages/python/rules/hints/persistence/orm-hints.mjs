import { RULES_TOOL } from '../tool.mjs';

export const PERSISTENCE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['eager-relationship'],
    describe: (subject) => `\`${subject}\` loads its related rows on every query of the model`,
    allowed:
      'Leave `lazy` at its default (or set `lazy="raise"`) and load the relation on the queries that need it: `select(Order).options(selectinload(Order.lines))`. An exception fits only for a small lookup relation that every read of the model needs.',
  },
  {
    tool: RULES_TOOL,
    rules: ['many-to-many-cascade-delete'],
    describe: (subject) =>
      `The many-to-many relationship \`${subject}\` deletes related rows that other owners still share`,
    allowed:
      'Cascade only `"save-update, merge"` on a `secondary=` (or `link_model=`) relationship; deleting the owner already deletes its rows in the association table.',
  },
];
