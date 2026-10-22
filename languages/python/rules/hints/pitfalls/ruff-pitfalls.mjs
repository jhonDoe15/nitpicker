import { ASYNC_HINTS } from './ruff-async.mjs';
import { DATETIME_HINTS } from './ruff-datetimes.mjs';
import { LOGGING_HINTS } from './ruff-logging.mjs';
import { PYLINT_ERROR_HINTS } from './pylint-errors.mjs';
import { PYLINT_WARNING_HINTS } from './pylint-warnings.mjs';

export const PITFALL_HINTS = [
  ...ASYNC_HINTS,
  ...DATETIME_HINTS,
  ...LOGGING_HINTS,
  {
    tool: 'ruff',
    rules: ['T100'],
    allowed: 'Remove the debugger import or breakpoint before committing; use the project logger.',
  },
  ...PYLINT_ERROR_HINTS,
  ...PYLINT_WARNING_HINTS,
];
