import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const FAILURE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['reset-skipped-on-failure'],
    describe: (subject) =>
      `\`${subject}\`: the undo step is not in a \`finally\`, so when the code between them raises it never runs and the state stays set for every later call`,
    allowed:
      'Put the undo step in `finally`: `token = var.set(value)`, then `try: yield` (or the work) and `finally: var.reset(token)`. In a context manager that holds several undo steps, register each one with `contextlib.ExitStack().callback(...)`, or write a class with `__exit__`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['except-misses-raised-exception'],
    describe: (subject) => {
      const [call = '', missing = ''] = subject.split(' misses ');
      const fix =
        missing === 'ValueError'
          ? 'catch the common base, `except ValueError` (it covers `JSONDecodeError` and `UnicodeDecodeError`)'
          : `add \`${missing}\` to the handler`;
      return `\`${call}\` can also raise ${missing}, which the \`except\` clause does not list: that failure escapes the handler and crashes the request or task instead of taking the fallback or error path; ${fix}`;
    },
    allowed:
      'Catch the common base: `except ValueError` for `json.loads` and `request.json()` (it covers `JSONDecodeError` and `UnicodeDecodeError`), `except (ValueError, TypeError, OverflowError)` for `timedelta(**value)` built from input. `except Exception` fits when any failure should take the same path.',
  },
  {
    tool: RULES_TOOL,
    rules: ['assert-on-external-state'],
    describe: (subject) => {
      const [checked = '', source = ''] = subject.split('|');
      const origin = /[)\]]$/.test(source) ? `\`${source}\`` : `the nullable field \`${source}\``;
      return `\`assert ${checked}\` checks a value that comes from outside this function (${origin}): when it is missing the request or job crashes with an \`AssertionError\` instead of handling it, and \`python -O\` removes the check`;
    },
    allowed:
      'Handle the missing value: `if schedule is None: return None`, or raise a domain error (`raise NotFound(...)`, `raise HTTPException(404)`), or use the value only when present (`schedule.name if schedule else None`). Keep `assert` for a value this function just built.',
  },
  {
    tool: RULES_TOOL,
    rules: ['warning-filter-in-function'],
    describe: (subject) =>
      `\`${subject}\` changes the warning filters of the whole process from inside a function: with several threads one thread's restore undoes another's filter, so warnings are lost or shown at random, and saving and restoring the filters costs time on every call`,
    allowed:
      'Fix the call that warns, or warn with a targeted category (`warnings.warn(message, MyDeprecationWarning, stacklevel=2)`) and let the caller filter it. Set filters once at program start: in `main()`, a `__main__` module, a console-script entry point or `-W` / `PYTHONWARNINGS`. In tests use `pytest.warns` or a `filterwarnings` mark.',
  },
];
