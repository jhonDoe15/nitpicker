# Rule messages

Part of the [Java preset guide](../java-preset.md).

PMD, Checkstyle and SpotBugs messages say what is wrong, rarely how to fix it, and never how to keep
code that is right as it is. `languages/java/messages/` holds one catalog per tool (`pmd.json`,
`checkstyle.json`, `spotbugs.json`) with an entry for every rule the preset can report: the
errorprone, bestpractices, performance, multithreading and security PMD categories (the rules the
preset leaves out too, for a project that turns one back on) plus `AvoidCatchingGenericException`, the boolean
simplification rules (`SimplifyBooleanReturns`, `SimplifyBooleanExpressions`, `SimplifiedTernary`,
`SimplifyConditional`, `CollapsibleIfStatements`, `LogicInversion`, `ConfusingTernary`), every check in
`google_checks.xml`, and every SpotBugs pattern. Each entry has:

- `fix`: one sentence, in our words, naming the allowed form (`null` when the tool's message already
  says it);
- `mayBeIntended`: whether the rule can fire on code a careful team keeps (a CLI printing with
  `System.out`, a catch-all at a boundary);
- `layout` (Checkstyle only): a layout check the formatter fixes; the message then says to run the
  formatter that ran (`google-java-format`, `palantir-java-format`, or "your Java formatter" when the
  style is not known), or to fix the layout by hand when none runs, instead of a fix of its own.

`readJavaFindings` passes every finding through `applyRuleMessages`
(`languages/java/messages/rule-messages.mjs`). It shortens Checkstyle rule names, then appends the
fix to the tool's message, and for an enforceable finding of a rule that may be intended (or one
the catalog does not know, from a project's own config) the exception route with the finding's own
path. Error Prone, the guard tools (`javac`, `forbiddenapis`, `duplicates`, `coupling`,
`dependencies`) and `spring` get the same route (PIT's `mutant-survived` and `mutant-nocoverage`
take the shared route that names the rule bare with its `function`); no rule message, ruleset,
guard or reader writes its own, and
`messages/exception-sentences.test.mjs` fails on one that does:

```
Usage of System.out/err. Use a logger, or write to a PrintStream, Writer or Appendable parameter; only static void main passes
System.out. An exception fits only without a main method. If this is intended, add {"rule":"pmd/SystemPrintln","paths":["src/main/java/demo/Cli.java"],"reason":"..."}
to "exceptions" in nitpicker.config.json.
```

The Kotlin preset, which runs the same tools on a mixed module's Java files, gets the fix and, on
the `.java` files, the same route, since its `exceptions` take the Java rules there (as they do detekt
rules, the configuration checks (`spring/<rule>`) and the Kotlin Spring rules (`pmd/<Rule>`));
findings in Kotlin sources get no Java route. An `exceptions` entry that names a
Checkstyle check by class (`checkstyle/com.puppycrawl...IndentationCheck`) is a config error that
gives the name to write instead.

A PMD message that still holds a `${name}` placeholder (PMD fills it only in some forms of a rule, for
example `AvoidUsingHardCodedIP` for a literal that is a method argument) is rendered before the fix is
added: that rule names the address literal read from the source at the finding's position, and any
other placeholder is dropped together with the space before it. The identity is computed from the original text.

Messages that already name `nitpicker.config.json` (the Spring rules) are left as they are, and
identities are computed before, so neither the new text nor the short Checkstyle name moves a
finding between base and head. `rule-catalog.e2e.test.mjs` downloads the pinned PMD, Checkstyle and
SpotBugs jars and fails when the catalogs and the tools' rule lists differ, so a version bump
cannot add a rule without fix text.

Error Prone findings are in no catalog: their allowed form comes from
`ingest/errorprone/messages.mjs`, and `applyRuleMessages` adds the route, except to a finding of a
`certainBugs` check outside the test source roots of `manifest.json`. The overlap step runs after
this, so
`overlap-pairs.json` names Checkstyle checks the same short way, or by the module id
`google_checks.xml` gives (`checkstyle/AnnotationLocationMostCases`); a unit test checks every rule
in it against the catalogs, nitpicker's own PMD rules, Error Prone's check list and the
`@defaultMessage` tags of `forbidden-apis.txt` (`forbiddenapis/legacy-date-time`).
