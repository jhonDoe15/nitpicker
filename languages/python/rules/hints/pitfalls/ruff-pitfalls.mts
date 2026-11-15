import { ASYNC_HINTS } from './ruff-async.mts';
import { LOGGING_HINTS } from './ruff-logging.mts';
import { PYLINT_ERROR_HINTS } from './pylint-errors.mts';
import { PYLINT_WARNING_HINTS } from './pylint-warnings.mts';
import type { RuleHint } from '../hint-types.mts';

export const PITFALL_HINTS: readonly RuleHint[] = [
  ...ASYNC_HINTS,
  ...LOGGING_HINTS,
  {
    tool: 'ruff',
    rules: ['T100'],
    allowed: 'Remove the debugger import or breakpoint before committing; use the project logger.',
  },
  ...PYLINT_ERROR_HINTS,
  ...PYLINT_WARNING_HINTS,
];
