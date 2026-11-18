# React

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

Applies when `react` is in `package.json`. Every React finding names the allowed form and its
exception route in the message: write that form, don't work around the rule.

- `useState` and `useRef` take a function or a lazy fill, not a built value: `useState(() => getTimes(range, now))`,
  `useRef<Runner | null>(null)`; a router, store or `QueryClient` is created once, not in the component body
  (`nitpicker/react-no-eager-initial-value`).
- A React Query mutation that handles `onSuccess` also handles failure: pass `onError` in the hook or call
  options or show `error` from the mutation (`nitpicker/react-mutation-drops-failure`); a `MutationCache`
  `onError` in the project covers every mutation.
- Component tests query through `screen` and assert what the user sees (text, roles, focus), never
  component state, instances or hook internals.
