# Editing existing code

Read this when your change edits a function that existed before it. Everything in `SKILL.md` still
applies to the lines you add.

- A function already over a size limit may be edited but must not grow: add one call to a new
  function and put the new code there. To make room, extract the smallest existing block into a
  function; extracted code is new code and must meet every rule, JSDoc types included. Don't
  rewrite or move legacy code the task doesn't need.
- A file or folder already over its limit must not grow either: put the new code in a new file,
  and a new file in a subfolder.
- An edited legacy line may keep a violation its function already had, as long as the function
  doesn't get more of it: change `lines.push(a)` to `lines.push(a, ...extra)` rather than adding a
  second push. The same goes for a `var`, a `{any}` or `{?string}` in a JSDoc type, or a
  `require()` of a whole module in `domain/`: keep the line as it is, and write your new lines in
  the allowed form.
- To read new fields from a legacy value typed `any` (or `*`), pass it as `unknown` to one reader
  that returns a typed object with every new field you need, nested ones included, and give that
  reader a `@typedef` for its result. In `domain/` that needs a `no-unknown-in-domain` exception
  the project already has; without one, pass new helpers the typed values the legacy function
  already reads.
- A legacy function that throws keeps its throw count: return the new failure as a union from a
  new helper and throw its reason by editing an existing `throw` line in place
  (``throw new Error(`Line ${n}: ${entry.reason}`)``). A `throw` on a new line counts as new even
  when the count holds. Keep the public function where it is.
- When a union gains a member that a legacy `switch` must handle and the function is over a limit,
  extract the switch into a new exhaustive function; never replace it with one call per member.
  Add the member to the `@typedef` union so the type check finds every `switch` that misses it.
- A legacy `@typedef` or JSDoc block you touch in `domain/` becomes yours: make its fields
  `readonly`, and a function you add to a legacy file gets full `@param` and `@returns` tags.
  `--fix` reformats the lines it can; re-read a file after it runs. Delete a comment your change
  makes false.
- Keep the module format of the file you edit: add to a CommonJS file with `require` and
  `module.exports`, not `import`, and don't convert a file between ESM and CommonJS unless the task
  says so.
- When a readonly value meets a mutable legacy type, make the type readonly; never drop `readonly`
  from the value.
- Never add a `.ts` file next to a `.js` file of the same name; migrating a file means renaming it,
  and the new `.ts` file then follows the full TypeScript rules.
