import {
  renderMessage,
  UNUSED_OPTION_FIX,
  UNUSED_OPTION_TEXT,
} from '../../../../../shared/messages/messages.mjs';
import { RULES_TOOL } from '../tool.mjs';
import { UNUSED_OPTION_SCOPES } from '../../../../../shared/unused-api/unused-api-policy.mjs';

const HELPER_CHAIN = ' -> ';

function isHelperChain(subject = '') {
  return subject.includes(HELPER_CHAIN);
}

function helperTakesItToo(subject) {
  return isHelperChain(subject) ? ' (the helper takes it the same way)' : '';
}

function randomDescription(subject = '') {
  if (isHelperChain(subject)) {
    return `\`${subject}\` draws randomness through a project helper called from domain code`;
  }
  return subject.startsWith('import ')
    ? `\`${subject}\` brings an id or random-data library into domain code`
    : `\`${subject}()\` draws randomness in domain code`;
}

const IN_TEST = 'In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).';

const HANDLE_EXCEPTION = `Catch the specific exception and handle it, or re-raise it with its cause (\`raise DomainError(...) from error\`); \`contextlib.suppress(SpecificError)\` ignores one expected error. ${IN_TEST}`;

const CAUGHT_LOG_ADVICE = {
  logging:
    'Keep the traceback: `logger.exception("message")` or `logger.error("message", exc_info=True)`; the exception as an argument drops it. Re-raising after the log also passes.',
  structlog:
    'Keep the traceback: `logger.exception("event")` or `logger.error("event", exc_info=True)`; the exception as a field drops it. Re-raising after the log also passes.',
  loguru:
    'Keep the traceback: `logger.exception("message")` or `logger.opt(exception=True).error("message")`; the exception as an argument drops it. Re-raising after the log also passes.',
};

const DOMAIN_CAUGHT_LOG_ADVICE =
  'Domain code does not log: re-raise the error with its cause (`raise DomainError(...) from error`) or return a failure, and let the caller in `adapters/` or the composition root log it with its traceback.';

function isDomainPath(path = '') {
  return path.split('/').slice(0, -1).includes('domain');
}

function ownerOf(subject) {
  return subject.slice(0, subject.lastIndexOf('.'));
}

export const STRUCTURE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['cancellation-not-propagated'],
    describe: (subject) =>
      `\`${subject}\` has a path that consumes cancellation or replaces it with another error`,
    allowed:
      "After cleanup, use a bare `raise` or re-raise the unchanged caught cancellation. Keep intentional cancellation boundaries in the backend's timeout or cancellation scope; returning a failure result or chaining another error does not propagate cancellation.",
  },
  { tool: 'ruff', rules: ['E722', 'BLE001'], allowed: HANDLE_EXCEPTION },
  {
    tool: RULES_TOOL,
    rules: ['swallowed-exception'],
    describe: (subject) =>
      `\`${subject}\` swallows the error: it only logs it or returns a default, and carries on`,
    allowed: `Re-raise it with its cause (\`raise DomainError(...) from error\`), return a failure result that carries the error (\`return Rejected(str(error))\`), or return the errors the function builds along with its result (\`return results, errors\`); logging alone is not handling. \`contextlib.suppress(SpecificError)\` ignores one expected error. ${IN_TEST}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['catch-log-without-exception'],
    describe: (subject) => `\`${subject}\` logs a caught error without its traceback`,
    allowed: (_subject, libraries, path) =>
      isDomainPath(path)
        ? DOMAIN_CAUGHT_LOG_ADVICE
        : CAUGHT_LOG_ADVICE[libraries?.logging ?? 'logging'],
  },
  {
    tool: RULES_TOOL,
    rules: ['blind-suppress'],
    describe: (subject) => `\`${subject}\` ignores every error`,
    allowed: `Name the expected exception: \`contextlib.suppress(KeyError)\`; or handle it or re-raise it with its cause. ${IN_TEST}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['frozen-dataclass'],
    describe: (subject) => `Dataclass ${subject} is not frozen`,
    allowed:
      'Declare records as `@dataclass(frozen=True)` and build a changed copy with `dataclasses.replace`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['enum-string-constants'],
    describe: (subject) => `${subject} are string constants that belong in one enum`,
    allowed:
      'Declare an enum: `class Status(enum.StrEnum): ACTIVE = "active"` on Python 3.11+, otherwise `class Status(str, enum.Enum)`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['no-inline-suppression'],
    describe: (subject) => `Inline suppression \`# ${subject}\``,
    allowed: 'Remove the comment and fix the code.',
  },
  {
    tool: RULES_TOOL,
    rules: ['todo-without-issue'],
    describe: (subject) => `The task marker \`${subject}\` has no issue`,
    allowed:
      'Name the issue right after the marker (`# TODO(#123): ...`, `# TODO PROJ-123: ...` or a link), or delete the comment and track the work in the issue tracker.',
  },
  {
    tool: RULES_TOOL,
    rules: ['process-env-access'],
    describe: (subject) =>
      `\`${subject}\` reads the process environment outside the composition root`,
    allowed:
      'Read the environment once in the composition root (`main.py`, `settings.py`, a `composition_root/` package) and pass the values in as arguments or a frozen settings dataclass.',
  },
  {
    tool: RULES_TOOL,
    rules: ['process-stream-access'],
    describe: (subject) => `\`${subject}\` reaches a standard stream outside the composition root`,
    allowed:
      'Take a `TextIO` parameter and write with `out.write(...)` or `print(..., file=out)`; the entry point (`main.py`, `cli.py`, a `[project.scripts]` target or the `if __name__ == "__main__":` block) passes `sys.stdout` or `sys.stderr`. For an entry point the gate does not recognize, list its file in `python.entryPoints`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['clock-now'],
    describe: (subject) =>
      isHelperChain(subject)
        ? `\`${subject}\` reads the clock through a project helper called from domain code`
        : `\`${subject}()\` reads the clock in domain code`,
    allowed: (subject) =>
      `Take the time as a parameter or a \`Callable[[], datetime]\`${helperTakesItToo(subject)} and call \`datetime.now(tz=UTC)\` in the composition root.`,
  },
  {
    tool: RULES_TOOL,
    rules: ['random-in-domain'],
    describe: (subject) => randomDescription(subject),
    allowed: (subject) =>
      `Take the value, a \`random.Random\` or an id factory as a parameter${helperTakesItToo(subject)} and create it in the composition root.`,
  },
  {
    tool: RULES_TOOL,
    rules: ['io-in-domain'],
    describe: (subject) =>
      isHelperChain(subject)
        ? `\`${subject}\` does input or output through a project helper called from domain code`
        : `\`${subject}\` does input or output in domain code`,
    allowed: (subject) =>
      isHelperChain(subject)
        ? 'Keep `domain/` pure: call the helper from `adapters/` or the composition root and pass its result in, or define a `Protocol` in the domain, implement it in `adapters/` and pass the adapter in.'
        : 'Keep `domain/` pure: define a `Protocol` in the domain and implement it in `adapters/`, then pass the adapter in.',
  },
  {
    tool: RULES_TOOL,
    rules: ['logger-in-domain'],
    describe: (subject) => `\`${subject}\` is imported into domain code`,
    allowed:
      'Return a result that says what happened, or raise a domain error, and let `adapters/` or the composition root log it.',
  },
  {
    tool: RULES_TOOL,
    rules: ['module-state-in-domain'],
    describe: (subject) => `Domain code uses the module state \`${subject}\``,
    allowed:
      'Receive the state as a parameter and return the new value; the composition root creates the object and passes it in.',
  },
  {
    tool: RULES_TOOL,
    rules: ['import-time-effect'],
    describe: (subject) =>
      isHelperChain(subject)
        ? `\`${subject}\` runs an external effect when the module is imported, so every import, tests included, performs it`
        : `\`${subject}()\` runs when the module is imported, so every import, tests included, performs it`,
    allowed:
      'Move the call into a function and call that from the composition root (`main.py`, a `create_app` factory) or under `if __name__ == "__main__":`, passing the result in.',
  },
  {
    tool: RULES_TOOL,
    rules: ['module-level-mutable-state'],
    describe: (subject) => `\`${subject}\` changes a module-level collection`,
    allowed:
      'Keep the state in an object that is created in the composition root and passed in, or build a new immutable value and return it. A registry filled once at import time (a decorator that adds the function to a table) is not run-time state; the exception route below covers its path.',
  },
  {
    tool: RULES_TOOL,
    rules: ['atomic-update-across-await'],
    describe: (subject) =>
      `\`${subject}\` is updated from a value read before an \`await\`: another task can change it while this one is suspended, and the write then overwrites that change`,
    allowed:
      'Await the new value into a local first and read and write the shared state in one step with no `await` between them (`delta = await fetch()` then `self.total += delta`), or serialize the whole update with one lock that every task shares (`self.lock = asyncio.Lock()` in `__init__`, then `async with self.lock:`); a lock or semaphore built in the method, a semaphore of more than one slot and a lock passed in are not proof.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unsafe-path-join'],
    describe: (subject) =>
      `\`${subject}()\` builds a file path from its input without a containment check`,
    allowed:
      'Resolve the path and check it stays inside the base before using it: `target = (base / name).resolve()`, then `if not target.is_relative_to(base.resolve()): raise ValueError(...)`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['singular-and-plural-field'],
    describe: (subject, _libraries, { singular, plural, kind }) =>
      `Optional ${kind} \`${singular}\` and \`${plural}\` of \`${ownerOf(subject)}\` are two ways to pass the same data`,
    referenceData: { singular: '<item>', plural: '<items>', kind: 'fields' },
    allowed: 'Keep the plural one and pass a single item as a one-element list.',
  },
  {
    tool: RULES_TOOL,
    rules: ['exhaustive-enum-predicate'],
    describe: (_subject, _libraries, { union }) => {
      const name = union === 'the Literal' ? union : `\`${union}\``;
      return `These comparisons list only some members of ${name}, so a member added later is silently classified as the default`;
    },
    referenceData: { union: '<enum>' },
    allowed:
      'Classify every member with a `match` that ends in `case _: assert_never(value)` (or an `if`/`elif` chain that ends in `else: assert_never(value)`), so the type checker fails when a member is added.',
  },
  {
    tool: RULES_TOOL,
    rules: ['generated-member-cycle'],
    describe: (subject, _libraries, { cycle }) =>
      `The generated \`==\` and \`hash()\` can follow \`${subject}\` around the cycle ${cycle}, so comparing or hashing two objects of the cycle recurses until RecursionError`,
    referenceData: { cycle: '<Class>.<field> -> <Other>.<back> -> <Class>' },
    allowed:
      'Leave the back reference out of the comparison: `field(compare=False)` in a dataclass, `attrs.field(eq=False)` in an attrs class. A field that only ever points down a tree, never back up, is the intended case.',
  },
  {
    tool: RULES_TOOL,
    rules: ['forwarding-wrapper'],
    describe: (subject, _libraries, { target }) =>
      `\`${subject}\` only forwards its parameters to \`${target}\`, with the same parameter and return types`,
    referenceData: { target: '<target>' },
    allowed:
      'Call the target directly and delete the wrapper; to keep the name, import the target under it (`from module import target as name`) or bind it (`name = target`).',
  },
  {
    tool: RULES_TOOL,
    rules: ['unused-option'],
    describe: (subject, _libraries, { scope }) =>
      renderMessage(UNUSED_OPTION_TEXT, {
        name: subject,
        scope: UNUSED_OPTION_SCOPES.python[scope],
      }),
    referenceData: { scope: 'private' },
    allowedFor: ({ scope }) =>
      renderMessage(UNUSED_OPTION_FIX, { scope: UNUSED_OPTION_SCOPES.python[scope] }),
    exception: 'top-level',
  },
];
