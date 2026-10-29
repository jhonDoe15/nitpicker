# Editing existing code

Read this when your change edits a function, file or folder that existed before it. Everything in `SKILL.md` still
applies to the lines you add.

- A function already over a size limit may be edited but must not grow: add one call to a new
  function and put the new code there. To make room, extract the smallest existing block into a
  function; extracted code is new code and must meet every rule. Don't rewrite or move legacy code
  the task doesn't need.
- A file or folder already over its limit must not grow either: put the new code in a new file,
  and a new file in a subfolder.
- Keep a legacy function's name and file: renaming it or moving it to another file brings all its
  findings back as new. Add a new function below the legacy one, not above it.
- An edited legacy line may keep a violation its function already had, as long as the function
  doesn't get more of it: change `lines.push(a)` to `lines.push(a, ...extra)` rather than adding a
  second push.
- To read new fields from a legacy `any` value, pass it as `unknown` to one reader that returns a
  typed object with every new field you need, nested ones included. In `domain/` that needs a
  `no-unknown-in-domain` exception the project already has; without one, pass new helpers the
  typed values the legacy function already reads.
- A legacy function that throws keeps its throw count: return the new failure as a union from a
  new helper and throw its reason by editing an existing `throw` line in place
  (``throw new Error(`Line ${n}: ${entry.reason}`)``). A `throw` on a new line counts as new even
  when the count holds. Keep the public function where it is.
- When a union gains a member that a legacy `switch` must handle and the function is over a limit,
  extract the switch into a new exhaustive function; never replace it with one call per member.
- `--fix` turns a legacy `interface` into a `type`, which then counts as yours: make it readonly
  in `domain/` and drop an `export` nobody imports. Delete a comment your change makes false.
- When a readonly value meets a mutable legacy type, make the type readonly; never drop `readonly`
  from the value.
