---
name: nitpicker-python
description: Use before writing or changing Python in a project that runs nitpicker with the python preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Python

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

If your change edits a function, class, module or package that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

## Check one file or folder

To look at one file or folder, for example before you change it, pass its path: `npx nitpicker --all
src/orders` lists every finding in it, and `npx nitpicker src/orders/order.py` gates only your
change to that file. Paths are read from the current folder. The analysis still covers the whole
project, so it takes as long as a full run; finish with the plain run below.

## Finish with the gate

1. Run the project's tests with its own runner (pytest, unittest, `manage.py test` or nose2).
   Failing tests are a tool error that names them; coverage and CRAP then come only from the tests
   that pass, and mutation testing leaves the failing modules out.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It has no `--fix` for Python; format with the "Format with ..." command
   printed at the start of the run (the gate does not read the project's formatter config). It takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done, unless you narrowed the run with `--analyzer`: then the summary says `Ran only: ...`
     and you run the gate again without it before you finish.
   - 1: fix the failing tests the summary leads with, every new finding and any tool error listed
     below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a tool missing from the
     environment) and rerun. Exit 2 is never a pass. If it says another run
     is in progress, wait for that run; never kill it.
     When the message links to [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md), the fix is there.
4. Never suppress: no `# noqa`, `# type: ignore`, `# pragma: no mutate`, `do_not_mutate`, config
   `exclude`/`disable`/`exceptions`, legacy entries, or weakened tests (`-x`, `-k`, `--deselect` and
   reruns in `addopts` are ignored anyway). If a finding seems wrong, stop and ask. Never pass
   `--accept-policy-change` or set `NITPICKER_ACCEPT_POLICY_CHANGE`: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

The allowed forms are on one page per topic. Before you write code, read the pages for the kind of code you are about to write; on your first task in a project, read them all.

- [Types, names and style](rules/style.md): annotations, paths, strings, defaults, parameters, flow, imports, loops, records, constants, names, signatures, regexes.
- [Errors and cancellation](rules/errors.md): specific exceptions, causes, cancellation handlers, `try` in a loop.
- [Async code, logging, time, processes and secrets](rules/concurrency-and-io.md): bounded fan-out, task groups, async calls, output and loggers, aware datetimes, debuggers, child processes, secrets.
- [Size and dependencies](rules/structure.md): function, class, module and folder limits, nesting, CRAP, clones, dependencies.
- [Tests](rules/tests.md): runners, assertions, branch coverage and mutants, process-wide state, containers and servers.

## When a rule flags legitimate code

- Every rule, also one the pages do not spell out (environment access, the domain, paths, shell and SQL,
  test honesty) reports the allowed form in its message: follow the form the message names.
- A finding that flags legitimate code (a command line entry point that prints) is lifted in
  `nitpicker.config.json`. A ruff, type-checker, `python-rules`, import-linter, duplicate or coupling
  finding goes under `python.exceptions`, with an entry such as
  `{ "rule": "T201", "paths": ["src/cli/**"], "reason": "..." }`, the rule being the id in the
  message. A function, CRAP, changed-branch coverage, mutation, file or size finding, and
  `slow-test`, `test-console-output`, `unused-option` and the other rules every preset shares, go
  under the top-level `exceptions`
  (`{ "rule": "function-lines-limit", "paths": [...], "function": "name", "reason": "..." }`), and
  one third-party console message goes in `testConsole.allow`. Each message ends with the entry and
  the list that takes it; each list rejects the other's rules. Don't add one to get past the gate:
  stop and ask.

## Repository files

- The gate fails committed secrets, binaries, build output and files over 1 MB; each message names
  the fix. Don't add an `exceptions` entry to get past one: stop and ask.
