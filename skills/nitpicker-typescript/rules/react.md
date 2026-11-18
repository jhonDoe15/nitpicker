# React

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

Applies when `react` is in `package.json`. Every React finding names the allowed form and its
exception route in the message: write that form, don't work around the rule.

- A React Query mutation that handles `onSuccess` also handles failure: pass `onError` in the hook or call
  options or show `error` from the mutation (`nitpicker/react-mutation-drops-failure`); a `MutationCache`
  `onError` in the project covers every mutation.
- Component tests query through `screen` and assert what the user sees (text, roles, focus), never
  component state, instances or hook internals.
