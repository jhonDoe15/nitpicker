# Editing existing code

Read this when your change edits a function that existed before it. Everything in `SKILL.md` still
applies to the lines you add.

- A function already over a size limit may be edited but must not grow: add one call to a new
  function and put the new code there. To make room, extract the smallest existing block into a
  function; extracted code is new code and must meet every rule. Don't rewrite or move legacy code
  the task doesn't need.
- An edited legacy line may keep a violation its function already had, as long as the function
  doesn't get more of it: change `lines.push(a)` to `lines.push(a, ...extra)` rather than adding a
  second push.
- To read new fields from a legacy `any` value, pass it as `unknown` to one reader that returns a
  typed object with every new field you need, nested ones included.
- When a readonly value meets a mutable legacy type, make the type readonly; never drop `readonly`
  from the value.
