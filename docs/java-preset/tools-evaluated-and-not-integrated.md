# Tools evaluated and not integrated

Part of the [Java preset guide](../java-preset.md).

- [Infer](../infer-evaluation.md) (RacerD, Starvation, Scope Leakage): not integrated. The Java analyzer of the
  release includes GPL-3.0-or-later code, it adds only a few annotation-driven checks over the shipped
  tools, and its finding key collides across packages. The page lists the rule ideas worth owning and the
  issues that track them.
- [BlockHound](../blockhound-evaluation.md) (runtime blocking-call detection in reactive tests): not
  integrated by nitpicker, left to the project as its own opt-in, expected to work in Gradle and Maven
  builds because PIT gets the test JVM's arguments (see [Slice 7](slice-7-mutation-with-pit.md)). The page
  lists the JVM flag it needs, the JaCoCo and PIT behavior, and what a project has to configure.
