import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const VERSION_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['unversioned-orm-entity'],
    describe: (subject: string) =>
      `\`${subject}\` rows are loaded, changed and saved again, but the model has no \`version_id_col\`, so two requests that update the same row both succeed and the later one silently overwrites the earlier one`,
    allowed:
      'Add a version column and name it in the mapper: `version: Mapped[int] = mapped_column(default=1)` with `__mapper_args__ = {"version_id_col": version}`, so SQLAlchemy fails the stale commit with `StaleDataError`. Django has no built-in version column and is not reported. An exception fits only when concurrent writers of the table are ruled out another way, such as `with_for_update()` or a single writer.',
  },
];
