# Open points

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- Resolved: the default composition-root pattern of
  `no-managed-resource-construction-outside-composition-roots` is now only `main.ts`, `server.ts`
  and `composition-root.ts`; `*factory*.ts` no longer qualifies. The `compositionRootPattern` option
  extends these defaults and cannot replace them, so a project adds roots but cannot drop the
  defaults. The `no-module-level-let` rule has no exemption, including for composition roots.
- Whether nitpicker's own code must follow the preset. Today its engine uses banned forms, such as
  `while (pending.pop())` graph walks.
