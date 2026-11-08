# Format check: ktlint, ktfmt or none

Part of the [Kotlin preset guide](../kotlin-preset.md).

The format check runs only for a project that uses a Kotlin formatter: Nitpicker does not make a
project adopt ktlint's style. `kotlin.formatter` (`"ktlint"`, `"ktfmt"` or `"none"`) overrides the
detection, and every format finding names it. The head checkout's choice
is read once and handed to the base run through the head policy, so a change that adds ktlint or
ktfmt checks the base with the same formatter and legacy formatting is not a new finding.

1. `"kotlin": { "formatter": "ktlint" | "ktfmt" | "none" }` in `nitpicker.config.json`.
2. Otherwise the build files (`build.gradle(.kts)`, `settings.gradle(.kts)`,
   `gradle/libs.versions.toml` of the project root; comments removed) are searched for the names:
   `ktlint` means ktlint, and only `ktfmt` means ktfmt (this finds the Gradle plugins and Spotless'
   `ktfmt()`). A Spotless `kotlinGradle { }` block is not searched, so
   `kotlin { ktfmt() } kotlinGradle { ktlint() }` is a ktfmt project. A project that names both tools
   gets ktlint; set the override if it uses ktfmt.
3. Otherwise `ktlint_` properties in `.editorconfig` mean ktlint.
4. Otherwise none: no format check runs.

On Maven the plugin declarations of the effective POM of the head checkout (`mvn help:effective-pom`,
which contains the plugins of the parent POMs and the active profiles) are read, not its text: a
project name, a dependency or a comment that holds the word `ktlint` or `ktfmt` decides nothing, and
a POM that does not parse names no formatter. `ktlint` means ktlint (the ktlint Maven plugin of
`com.github.gantsign.maven` or `com.github.shyiko`, or a Spotless `<kotlin><ktlint/></kotlin>`
step), and `ktfmt` means ktfmt (a Spotless `<kotlin><ktfmt/></kotlin>` step). Both mean ktlint, as on
Gradle. A formatter that is run through `exec-maven-plugin` is not read; set `kotlin.formatter`
there. The ktfmt style is the `<style>` (`KOTLINLANG`, `DROPBOX`, `GOOGLE` or `META`) of the ktfmt
step itself, never the `<style>` of another formatter such as the Java `googleJavaFormat` step; no
style means the followed indentation decides, as on Gradle (`DROPBOX` is ktfmt's older name for the
kotlinlang style, and `dropboxStyle()` in a Gradle build means the same). The head POM is the one
source: the convention step, the summary and the run of both snapshots use the formatter and style it
gives, so the base run cannot pick another formatter than the head run.

Build logic that lives in `buildSrc`, an included build or a submodule is not searched; use the
override there.

- **ktlint.** The pinned CLI runs on a copy of the Kotlin sources in a temporary folder whose root
  `.editorconfig` says `root = true`, so no `.editorconfig` of the project or of the folders above it
  reaches it (a parent `.editorconfig` and the home one are ignored too). A project whose
  `.editorconfig` set ktlint properties is checked with ktlint's defaults and the conventions
  followed until it opts in with `"tools": { "ktlint": { "precedence": ["project", "nitpicker"] } }`;
  then every `.editorconfig` under the project (build folders, `node_modules` and dot tool folders
  skipped) and in the folders above it up to the repository root is copied to the same relative
  path in the copy, so nested files and path-qualified sections (`[src/test/**.kt]`) keep applying;
  only the topmost one gets `root = true`, and the conventions are ktlint defaults below them. The
  opt-in needs an `.editorconfig` at the project root or above, else it is a tool error that says to
  create one or remove `"project"`. `["nitpicker", "project"]` is a config error for ktlint, since
  ktlint always reads its `.editorconfig` first. The conventions (`kotlin.lineLength`, `kotlin.indentation` and the others) take their values from the detekt, ktlint and ktfmt configs of the merge base in a comparison, and from the branch only when the base has no Kotlin sources, so a pull request cannot raise its own limit by editing them. The same values are enforced in the run: the followed `indent_size`, `max_line_length`, trailing-comma and wildcard-import values are appended after the matching section of every mirrored `.editorconfig` (nested and parent ones too) that sets them differently, and the followed detekt conventions are layered last in a file of their own, so an edited width in the branch changes neither the run nor the printed line. The run prints once what ktlint runs with and what
  to do to lift a rule, and one `Ignoring .editorconfig; opt in with ...` line when a project
  `.editorconfig` exists and is not used. Each violation is one finding: rule
  `ktlint.<ruleset>:<rule>` (for example `ktlint.standard:no-wildcard-imports`), the line, and
  ktlint's message plus a pointer to that advice. Not every violation is fixed by `ktlint --format`.
  The identity is the message with its numbers replaced, like detekt's.

Two styles are equally valid in each of these, so the preset follows the project (the
[`conventions`](../usage.md#configuration) key pins them). Which formatter applies which id:

| Id                       | ktlint                           | ktfmt                                | no formatter | detekt                          |
| ------------------------ | -------------------------------- | ------------------------------------ | ------------ | ------------------------------- |
| `kotlin.indentation`     | `indent_size`                    | style `meta` (2) or `kotlinlang` (4) | not offered  | -                               |
| `kotlin.trailingCommas`  | `ij_kotlin_allow_trailing_comma` | not offered (ktfmt always adds them) | not offered  | -                               |
| `kotlin.wildcardImports` | disables `no-wildcard-imports`   | -                                    | -            | `WildcardImport: active: false` |
| `kotlin.lineLength`      | `max_line_length`                | `--max-width`                        | not offered  | `MaxLineLength: maxLineLength`  |

`kotlin.lineLength` is any number of columns (`100`, `120` and `140` are the measured ones; an `.editorconfig` or detekt width such as 110 is followed as it is) and has no default. It is measured like `python.lineLength`: the
longest line that could have been wrapped, against the shortest join of a wrapped argument list, and
else the lines that run past 100 or 120. With no clear answer each tool keeps its own width.
An id the formatter cannot apply is neither measured nor printed, and pinning it is a config error.
`java.indentation` (google-java-format `2` or `--aosp` 4, or `tab`; palantir-java-format is always 4, see `java.formatter` and `java.lineLength` in the [Java preset](../java-preset/style.md)) is the Java twin of `kotlin.indentation` and
applies to the Java sources of the same project; the difference is the default: `java.indentation`
falls back to 2 (google-java-format's), while `kotlin.indentation` has none, because ktfmt's default
is 2 and ktlint's is 4, so with no clear majority the tool keeps its own. For ktlint the choices are a
defaults `.editorconfig` (`--editorconfig`) below the root file of the copy, for detekt a layer below
the project's `detekt.yml`. The scope-function rules do not change. With the project listed, a key the
project sets wins for every tool and the run prints it as "from your .editorconfig", "from your detekt
config" or "from your build file" instead of "used by N of M measured files".

- **ktfmt.** `--dry-run` lists the files that would change. The style is the one the build names
  (`kotlinLangStyle()`, `googleStyle()` or `metaStyle()`), with or without the ktfmt opt-in: which
  formatter a project uses, and the style it declares for it, are facts about the project, like the
  Java preset's declared formatter, so they are read from the build files at the merge base and
  indent `kotlin.indentation` accordingly ("from your build file"). Without a named style it is
  `--kotlinlang-style` when most Kotlin files indent by 4 (`kotlin.indentation`), else ktfmt's
  default (Meta). Config files are different: an `.editorconfig` is read only with
  `"tools": { "ktfmt": { "precedence": ["project", "nitpicker"] } }`, which passes
  `--enable-editorconfig` and runs in a copy of the sources with the same mirrored `.editorconfig`
  files as ktlint; without it ktfmt runs in the project, without a copy of the sources. `["nitpicker", "project"]` is a
  config error for ktfmt, as ktfmt has no flag to ignore the `.editorconfig` once enabled. One
  `format` finding per file, tool `ktfmt`, identity `format`, whose message refers to the
  `Format with ktfmt` command printed at the start of the run; a file that already failed on the base
  stays baselined, new files and files that start failing do not.
