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

The version and options the build file pins for a Spotless formatter are followed the same way, on
Gradle (Groovy and Kotlin DSL) and Maven (`spotless-maven-plugin`): `palantirJavaFormat("2.90.0")` and
`googleJavaFormat("1.17.0")` (or `<version>` in the Maven step) select that release from Maven Central
instead of the one nitpicker pins, and `formatJavadoc` and `reflowLongStrings` are applied as Spotless
reads them. Spotless defaults apply when the step does not set them: Javadoc is formatted for
google-java-format and left as written for palantir-java-format, and long strings are not reflowed for
either, so nitpicker passes `--skip-reflowing-long-strings` (and `--skip-javadoc-formatting` for
google-java-format with `formatJavadoc(false)`). The printed line says what was followed, for example
`Java formatter: palantir-java-format, version 2.90.0, Javadoc left as written, long strings not
reflowed (from your build file)`. Options that cannot be honoured fall back and say so in that line:
palantir-java-format's command line cannot format Javadoc, so `formatJavadoc(true)` prints `Javadoc
formatting (formatJavadoc) is not checked`; a google-java-format release older than 1.8 has no skip
flags, so none are passed. A version or option that is a variable is resolved when it is simple: a
`libs.versions.*` entry of `gradle/libs.versions.toml`, a `gradle.properties` key, a local `def` or
`val` string, `"$name"`, or a Maven `${property}` of the POMs. When it cannot be read, the run prints
`Could not read the Java formatter version (...) in build.gradle; using the version nitpicker pins`, and
an option it cannot read counts as not set (`using the Spotless default`) and never as enabled. Only
the steps in the `java` block of `spotless` count (a `format 'docs', { ... }` block for other targets
is ignored); the version and options come from one declaration, and a run says when two declarations
disagree and which one it used. Steps of other plugins (`com.palantir.java-format`, a version catalog
entry) carry no version, and the pinned release runs. palantir-java-format has accepted
`--skip-reflowing-long-strings` in every release published to Maven Central, so it needs no version
guard. A
`java.formatter` pin in `nitpicker.config.json` ignores the build file's version and options. `--fix`
formats with the same release and flags. The Kotlin preset's Java sources are handled the same way.

The build files are read from the same snapshot as the measured conventions, the formatter version and
options included: the merge base in a
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
fails on this.

The formatters need JDK 21 or newer to run. On Gradle `nitpickerFormat` runs on a toolchain of the
highest of 21, the JDK Gradle runs on and the JDKs the sources compile with; on Maven on the
project's `java` when it is 21 or newer, else on the lowest installed JDK 21 or newer (see
[Maven builds](maven-builds.md)). `--fix` formats on the newest installed JDK from 21 to 25, or on
the project's `java` when that is newer, so a Gradle toolchain newer than `JAVA_HOME` still parses.
A formatter that fails (exit code other than 0) is a tool error with its message, never an empty
check. palantir-java-format 2.90.0 cannot parse `import module` yet; google-java-format 1.35.0
parses every Java 25 form.

With `java.formatter` set to `none`, `java.lineLength` is measured from wrapped
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
