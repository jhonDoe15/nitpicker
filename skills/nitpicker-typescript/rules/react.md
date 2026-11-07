# React

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

Applies when `react` is in `package.json`. Every React finding names the allowed form and its
exception route in the message: write that form, don't work around the rule.

- Component tests query through `screen` and assert what the user sees (text, roles, focus), never
  component state, instances or hook internals.
