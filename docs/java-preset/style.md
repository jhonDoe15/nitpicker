# Style

Part of the [Java preset guide](../java-preset.md).

The formatter owns layout, and nitpicker follows the formatter the project uses. The
`java.formatter` convention is `google` (google-java-format, the default), `palantir`
(palantir-java-format, Apache-2.0, pinned like google-java-format and resolved the same way on Gradle
and Maven) or `none` (no format check). It comes, in this order, from:

1. A pin in `"conventions": { "java.formatter": "..." }`.
2. The build files, with no opt-in: Spotless `googleJavaFormat()` or `palantirJavaFormat()` in
   Gradle, `spotless-maven-plugin` with `<googleJavaFormat>` or `<palantirJavaFormat>`,
   `fmt-maven-plugin`, the `com.palantir.java-format` plugin, or either formatter's artifact in a
   version catalog. `googleJavaFormat().aosp()`, `.style("AOSP")` and a `<style>aosp</style>` read as
   google-java-format with 4 spaces; `palantirJavaFormat().style("GOOGLE")` reads as google (with
   `"AOSP"`, google with 4 spaces); `eclipse()` and `prettier()` in a Spotless `java` block read as
   `none`. The scan covers the root and module `build.gradle(.kts)` and `settings.gradle(.kts)`, the
   `gradle/*.versions.toml` catalogs, the convention plugins under `buildSrc/` and `build-logic/`
   (`.gradle`, `.gradle.kts`, `.kt`, `.groovy`) and every `pom.xml` of the project (module and parent
   poms), at most 200 files, shallowest first. Files under `src/`, `node_modules`, `build`,
   `target`, `out`, `fixtures` and `testdata`, and paths in `exclude`, are skipped. Comments are
   removed by a reader that knows string literals (`//` and `/* */` only outside quotes in Gradle
   files, `#` in TOML; the XML parser skips pom comments), so a glob such as `'**/*.java'` or
   `**/*Test.java` around the plugin does not hide it. Within a file palantir wins when both are
   named; across files the most common declaration wins and a tie declares nothing.
3. The Java files, when the build names nothing: each file votes from a call the formatter wrapped
   after `(`, never from its longest line, and a file with no such call votes for nothing. Two spaces
   or four spaces wrapped at 100 vote `google`, four spaces wrapped at 120 `palantir`, and block
   indentation with tabs, 140 columns or two spaces at 120 vote `none` (tabs inside text blocks and
   comments do not count). The winner needs at least 3 voting files and more than half of the
   votes. With weaker or no evidence the choice stays `google`, and the measured indentation picks
   `--aosp`. An IntelliJ project with four spaces and 120 columns looks like palantir-java-format to
   the measure; pin `java.formatter` to `none` for it.

The formatter a build file declares (`googleJavaFormat()`, `palantirJavaFormat()`, `aosp()`, a style
name, the Maven plugins) is a fact about which formatter the project uses, so it is detected without
any opt-in; the Kotlin preset does the same for the ktfmt style its build names. Config files (the
Checkstyle config, detekt, `.editorconfig`, `ruff.toml`) are read only once their tool lists
`"project"`.

The build files are read from the same snapshot as the measured conventions: the merge base in a
comparison (so a pull request that adds `palantirJavaFormat()` is still judged at the limits of its
base, and starts being judged at 120 once it is merged), the checked-out tree for `--all`, and the
pull request's own tree only when the base has no Java sources yet. The Checkstyle config below is
read from the same snapshot. Nothing in `nitpicker.config.json` is involved, so the policy gate has
nothing to report here; the printed "Following this project's conventions" block names the
formatter and where it came from.

The formatter fixes what it can: google-java-format wraps at 100 and indents with 2 spaces (4 spaces,
8 for a continuation line, with `--aosp`, which nitpicker uses for the `java.indentation` convention
`"4"`; a declared `googleJavaFormat()` without `.aosp()` fixes it at `"2"`); palantir-java-format
indents with 4 and wraps at 120. `java.indentation` is `"2"`, `"4"` or `"tab"`. `java.lineLength` is
any whole number of columns from 10 to 999 (`"100"`, `"120"` and `"140"` are the measured ones);
it drives the limit of `line-length-limit` for Java files. When the formatter comes from a pin or the
build file, a pin that contradicts what it fixes is a config error that names where the formatter
came from (`"conventions.java.lineLength" is "120", but google-java-format (declared in your build
file) fixes it at "100"`). When the formatter is only the default or was measured, the contradiction
means the project does not use it: the formatter becomes `none` and the run prints why (`from your
conventions.java.lineLength pin in nitpicker.config.json`). A repository without Java files never
fails on this. With `java.formatter` set to `none`, `java.lineLength` is measured from wrapped
code the way `kotlin.lineLength` is (unbreakable lines, such as imports, URLs, string literals and
text blocks, do not vote).

When `tools.checkstyle.precedence` lists `"project"` and `config/checkstyle/checkstyle.xml` has a
`LineLength` module, its `max` (any number; Checkstyle's default 80 for a module without one) wins
over the formatter and the files (the project overrides only what it sets). A formatter that was
only the default or measured gives way to it and becomes `none`; a declared or pinned one stays, and
runs at the Checkstyle width, because listing `"project"` is the project's own decision about the
width. A `LineLength` module with `severity` `ignore` is not read, and a `max` outside 10 to 999 is
ignored with a printed note. Checkstyle's own `LineLength` stays suppressed, so the limit is checked once, by
`line-length-limit`. The run prints each choice and its source. The conventions apply to the Java
sources of a kotlin-preset project too. They come from the head policy file at run time, and the
function `javaStyle()` in `languages/java/adapters/style/java-style.mjs` turns them into the style
(`google`, `aosp`, `palantir` or `none`), which reaches Gradle as `-Pnitpicker.java.style` and Maven
as `javaStyle`.

A badly formatted file is one `google-java-format`, `google-java-format --aosp` or
`palantir-java-format` finding (the one that ran), not hundreds. Its message gives the command that
fixes the file (`google-java-format --replace <Java files>`, with `--aosp`, or `palantir-java-format
--palantir --replace <Java files>`) and says how to pin `conventions.java.formatter` (`"google"`,
`"palantir"` or `"none"`) in nitpicker.config.json when it is not your formatter. The Checkstyle
checks that only restate the formatter's layout are suppressed in both styles (`Indentation`,
`CommentsIndentation`, `WhitespaceAround`, `WhitespaceAfter`, `GenericWhitespace`, `MethodParamPad`,
`ParenPad`, `NoWhitespaceBefore`, `OperatorWrap`, `SeparatorWrap`, `NoLineWrap`, `CustomImportOrder`,
`EmptyLineSeparator`, `LeftCurly`, `RightCurly`, `AnnotationLocation`, `FileTabCharacter` and the
empty-block spacing regex), in `languages/java/gradle/checkstyle-suppressions.xml`. Checkstyle keeps
everything that is not layout: naming, `NeedBraces`, `AvoidStarImport`, empty catch blocks, the
Javadoc rules, `OneStatementPerLine` and the rest. Checkstyle's `LineLength` is suppressed too: the
line-length rule above replaces it. A project's own
Checkstyle config (`tools.checkstyle.precedence`) is layered over nitpicker's, and these suppressions apply to the
merged config as well: the formatter and the line-length rule own layout and line length, so a project's settings
for those checks change nothing.

With no formatter (`none`), nothing else reports the layout and the unused imports that
google-java-format used to remove, so the Gradle and Maven runs use
`languages/java/gradle/checkstyle-suppressions-unformatted.xml`, which suppresses only the layout
checks the formatters disagree on or that depend on a house style (`CommentsIndentation`,
`OperatorWrap`, `SeparatorWrap`, `NoLineWrap`, `CustomImportOrder`, `EmptyLineSeparator`,
`AnnotationLocation`, the empty-block spacing regex), `LineLength` and, by id, `LeftCurlyNl` (it asks
for the brace of `case X: {` on its own line, which neither formatter does). The checks both
formatters agree on stay on: `WhitespaceAround`, `WhitespaceAfter`, `GenericWhitespace`,
`MethodParamPad`, `ParenPad`, `NoWhitespaceBefore`, `LeftCurlyEol` (the other `LeftCurly`) and
`RightCurly`, `FileTabCharacter`, and
`Indentation` at the measured width (2 by default; at 4 the `basicOffset`, `caseIndent` and
`arrayInitIndent` of the bundled check become 4; for tab-indented files `Indentation` and
`FileTabCharacter` are removed). Checkstyle's `UnusedImports` is added to the bundled checks, so an
unused import is still a finding; Error Prone's `RemoveUnusedImports` stays off and PMD has no
unused-import rule in the ruleset. The init script (`nitpicker.init.gradle`, reading
`-Pnitpicker.java.style` and `-Pnitpicker.java.indentation`) and `unformatted-checks.mjs` (Maven)
make the same edits, and these findings say to fix the layout by hand. The Java sources of a
kotlin-preset project get the same checks.

The style reaches Gradle as the command-line property `-Pnitpicker.java.style=aosp`, never through
`gradle.properties`. The runner reads the convention from the head policy file at run time, like the
other policy values, so it is not part of the analyzer's configuration hash; the base run gets the
same policy file, so a change of style in the same pull request does not fail the files it makes
differ. The Maven run resolves only the formatter jar its style needs (google-java-format, or
palantir-java-format, or neither for `none`).
