# nitpicker-engine (prototype)

A Rust program that runs nitpicker's Java rules without a JVM: tree-sitter parses the sources, a type index
reads class files, and an XPath 3.1 evaluator runs the PMD XPath rules of the Java rulesets unchanged. The
goal is the same findings as PMD in a fraction of the time. A Java run of nitpicker sends the XPath rules of a
module to the engine and leaves PMD the rules it implements in Java (see "In a Java run").

## Layout

- `src/engine/`: language-neutral part (file walk, parallel run, findings, token duplicates).
- `src/java/`: Java checks on the syntax tree (a set of Checkstyle checks, facts, metrics).
- `src/java/cpd/`: PMD CPD's Java tokens and match search, for the duplicates step (see "In a Java run").
- `src/java/types/`: type index over class files (jars, folders, the JDK's `jmods`) and the sources, and
  expression and call resolution.
- `src/java/pmd/`: the tree as PMD shapes it (`tree.rs`), the XPath evaluator (`xpath/`), the PMD functions
  `pmd-java:typeIs`, `typeIsExactly`, `matchesSig`, `modifiers` and friends (`xpath/library.rs`), suppressions
  (`suppress.rs`) and the rule runner (`rules.rs`).
- `tests/`: Java fixtures, rule lists and the findings PMD gave for them.
- `parity/`: scripts that ask PMD for its findings and compare.

## Run

```
cargo build --release
NP_XPATH_RULES=tests/rules/all.json JAVA_HOME=<jdk 21> target/release/nitpicker-engine <source dir> \
  --rules _XPath --classpath <file with one jar or class folder per line, absolute paths> --out report.json
```

`tests/rules/all.json` holds the 353 XPath rules a Java run sends to PMD (name, message, query, properties):
the 252 XPath rules of the Java rulesets and the 101 built-in PMD XPath rules those rulesets switch on, with
their property overrides. `parity/rules-from-rulesets.py <rulesets dir> <pmd-java jar> <out.json>` writes it
and prints the built-in rules PMD implements in Java, which the engine does not run.

PMD selects nothing for an element name it has no node type for, without an error. A unit test parses every
query of the Java rulesets and fails on a name missing from `tests/rules/pmd-node-names.txt`, the concrete
node types of PMD 7.16.0's Java tree.

Other switches: `NP_XPATH_ONLY=<rule,rule>` runs some rules, `NP_XPATH_STATS=<file>` writes time
and findings per rule, `NP_SLOW=<ms>` prints the files slower than that, `NP_DBG=1` prints each type question
the resolver gave up on.

## In a Java run

The PMD step of a module (Gradle or Maven) resolves its rulesets the way PMD does and splits them
(`languages/java/builds/rulesets/engine/`): each rule whose class is `XPathRule` goes to the engine with the
include and exclude patterns of the ruleset it runs in, and the rules PMD implements in Java go to PMD in
generated rulesets. The engine reads the same source folders and class path file as PMD and the JDK PMD runs
on (`NITPICKER_JDK`), and takes PMD's `--suppress-marker` from `NP_SUPPRESS_MARKER`. Its findings are written
as `pmd-engine.sarif` next to `pmd.sarif` and join PMD's findings when the reports are read.

- A file the grammar cannot read in full (`syntaxErrorFiles` in the report) goes back to PMD with the XPath
  rules that cover it, and the engine's findings in it are dropped. Grammar gaps in valid Java are masked before
  parsing, keeping every byte in place (`src/java/grammar.rs`): an annotation before `...`, a qualified record
  pattern, and a NUL character in a string, text block, character literal or comment, where the grammar would
  stop. A NUL in code leaves the file broken.
- The engine's findings in a file PMD could not read are dropped: PMD reports none there.
- A project's own PMD ruleset stays with PMD as it is.
- PMD runs every rule, as before, when `NITPICKER_ENGINE=off`, when there is no engine binary for the
  platform, when the engine fails, or when the JDK has no `jmods` folder.

The Error Prone step of a module (Gradle or Maven) asks the engine first
(`languages/java/builds/errorprone/`). For each source set it runs `--rules _ErrorProne` with the checks of
`ENGINE_CHECKS` in `NP_EP_ONLY`: NullAway (main sources only, `NP_NULLAWAY_PACKAGES` set to the packages of the
module's own classes, as the Error Prone run sets `AnnotatedPackages`) and the checks whose whole message the
engine gives: `ArrayRecordComponent`, `EmptyCatch`, `EnumOrdinal`, `EscapedEntity`, `InconsistentOverloads`,
`JavaUtilDate`, `SuppressWarningsWithoutExplanation`, `SystemOut` and `TypeParameterUnusedInFormals`. Those
checks get `-Xep:<Check>:OFF` in the arguments file of the Error Prone run, and the engine's findings are
written as `errorprone-engine.json` next to `errorprone.json`, in the same shape, and join it when the reports
are read. The engine skips the checks a run did not select. A library class counts as checked by NullAway the way
NullAway decides it: `@NullMarked` on the class, a class around it or its `package-info`, `@NullUnmarked` to
switch it off again. The module path of a source set reaches the engine apart from the class path
(`--module-path`): a module on it whose declaration carries `@NullMarked` makes NullAway check its packages,
except a `@NullUnmarked` one, as NullAway decides it. A class file's nullness comes from its
declaration annotations and from its type annotations (JSpecify's `@Nullable` is written that way): a mark on
the type itself makes a field, a result or a parameter nullable, one on a variable arity parameter's elements
lets each argument be null, and one on its array lets the array be null. A parameter list printed in a message
shows the type annotations the way javac prints them.

- The other ported checks stay with Error Prone: it ends their messages with a `Did you mean ...?` sentence
  made from its suggested fix, which the engine does not write yet.
- A source set stays with Error Prone as a whole when an annotation processor runs in its compile (Lombok and
  generated sources change what the compiler sees), when the project passes Error Prone options other than
  check levels, when the engine cannot read one of its files, or when the engine fails.
- Test sources run with `--test-only`, Error Prone's `-XepCompilingTestOnlyCode`: the checks that return early
  on test-only code report nothing there, `NarrowCalculation` leaves out products, `UseCorrectAssertInTests`
  looks at every method and an ignored `boolean` result is fixed with `assertThat(...).isTrue()`.
- A source set compiled with `-encoding` other than UTF-8 is read in that character set (`--encoding`). The
  engine knows the sets whose decoding it shares with the JDK (`src/engine/encoding.rs`); another one stops the
  engine, and Error Prone keeps the checks of that source set.
- A check the project switched off is not run. Findings in generated source folders are dropped, as the Error
  Prone run excludes those paths.
- Error Prone runs every check, as before, when `NITPICKER_ENGINE=off`, when there is no engine binary for
  the platform or when the JDK has no `jmods` folder. When Error Prone is skipped for a module, the engine's
  findings for it are not reported either.

On 16 Gradle modules of Apache Kafka (clients, metadata, raft, server-common and smaller ones) the reports hold
the same 17,557 findings either way, 3,025 of them from the engine. The step takes as long as before: Error
Prone alone 185 s, the engine 19 s plus Error Prone without those checks 167 s, with the same peak memory
(1.8 GB in the largest module), since the compile stays. The time goes down when a module needs no Error Prone
run at all.

The duplicates step of a module (Gradle `nitpickerCpd`, Maven) runs `cpd --report <cpd.xml> <source dir>...`
in place of PMD CPD (`src/java/cpd/`). It is CPD as nitpicker's `CpdReport.java` runs it, step for step: the
same text (byte order mark dropped, line endings turned into `\n`, `.class` overwritten with `const`, Unicode
escapes translated and mapped back to columns the way PMD maps them), the same tokens from a port of the lexer
part of PMD's Java grammar, the same filter (package and import statements, semicolons, `CPD-OFF`/`CPD-ON`
comments, `@SuppressWarnings("CPD-START")` ... `"CPD-END"`, identifiers and literals anonymized, a
constructor's name kept, with one constructor detector for all files in order, as PMD keeps one, so a file
that leaves a class open changes the next), the same image ids, rolling hash and match collection, and the same report order.
The report is PMD's `cpd.xml` without the code fragments and the time stamp, which nitpicker does not read.
The hash groups are searched in parallel: a token belongs to one group, and every mark and pair of a match
stays inside the group its first window falls in, so the order PMD visits them in does not change the result.

- The engine leaves the module to CPD (exit status 3, the reason in `cpd-engine-log.txt`) when PMD would skip
  a file or report a lexical error in it, when a file is not UTF-8, when a source folder holds a symbolic
  link, and when two source folders reach the same file. `cpd-engine-log.txt` says which of the two wrote the report.
- CPD runs as before when `NITPICKER_ENGINE=off` or there is no engine binary for the platform.

Every token of every Java file of Apache Kafka (6,321 files), Keycloak (8,730) and mall (524) is the same as
PMD's, and CPD over each whole repository gives the same report (15,089, 8,805 and 5,240 duplications): 2.0 s
instead of 13.4 s on Kafka, 2.8 s instead of 10.3 s on Keycloak, 1.3 s instead of 22.6 s on mall.

## Same findings as PMD

`cargo test --release` runs the fixtures in `tests/fixtures` and compares file, rule, line and column with
`tests/expected`, which PMD 7.16.0 produced:

```
PMD_CLASSPATH=<class path of the PMD 7 command line> \
  python3 parity/pmd-expected.py tests/rules/all.json tests/fixtures/formats tests/expected/formats.json
```

For a real project, write PMD's rows once and compare an engine report with them:

```
python3 parity/pmd-expected.py tests/rules/all.json <source dir> pmd-rows.json <class path file>
python3 parity/compare.py report.json pmd-rows.json <source dir> [rule]
```

Measured with all 342 rules on 4 cores (findings: same / missed / extra):

| Code base | Files, lines | PMD 7.16.0 wall, CPU, peak | Engine | Findings |
| --- | --- | --- | --- | --- |
| Nacos, all modules | 5,407, 844k | 158 s, 611 s, 2.4 GB | 44 s, 171 s, 0.5 GB | 20,506 / 1 / 4 |
| commons-lang, main and tests | 217k lines | 52 s, 196 s, 2.7 GB | 14 s, 52 s, 0.2 GB | 4,343 / 9 / 0 |
| jhipster-sample-app | | 10.5 s | 1.1 s | 718 / 0 / 0 |
| Elasticsearch `server` | 5,106, 1.04M | 146 s, 565 s, 2.6 GB | 31 s, 119 s, 0.6 GB | 14,458 / 2 / 0 |

The first three rows were measured before the lookup caches of #2064; the Elasticsearch row after them and after
#2121 and #2122. The two Elasticsearch rows the engine leaves out are wrong PMD findings: PMD leaves the type of
two lambdas unfinished and `RetryInTest` then matched them; the rule now asks `typeIsExactly` for lambdas and
method references (#2125). The PMD-shaped trees of all 5,106 files have
the same node names in the same places as PMD's but for one (`module-info.java`).

On the whole Elasticsearch tree (18,155 files, 3.3M lines) with the 130 rules of the first set the engine takes
75 s, 264 CPU-s and 1.7 GB. PMD takes about 190 s, 750 CPU-s and 4.6 GB there and stops reporting after a
StackOverflowError in its type inference, so findings on that tree are compared part by part.

With spring-petclinic and five fixture projects of the Java adapters that is 27,983 findings the same, 12
missed and 7 extra. The 19 differences are type questions (a raw `Constructor` receiver, a primitive varargs
overload, a lambda parameter inside `argThat`, the diamond on a self-bounded class) and one file tree-sitter
parses differently. 302 of the 342 rules fire on these projects; `tests/fixtures/builtins` makes most of the
rest fire.

## Memory

The type index is built from outlines: each file with the bodies of methods, constructors and initializers
blanked (kept when a class is declared inside). The outlines are dropped before the rules run, and each file is
parsed again for its rules and dropped when they are done, so the peak does not grow with the full trees of the
whole project. Class files are listed at start and read on first use.

## PMD behaviour the engine copies

- A query that fails at run time on a file gives no findings for that rule and file. The report lists it as
  rule `!<name>`.
- `// NOPMD` on the first line of a finding and `@SuppressWarnings` with `"PMD"`, `"PMD.<Rule>"` or `"all"` on
  any enclosing declaration hide the finding. Block comments and other spellings do not. `"serial"`,
  `"unused"` and `"fallthrough"` hide the rules PMD maps them to.
- A rule's `violationSuppressXPath` runs on the node of each finding and drops the finding when it selects
  anything.
- In XPath regular expressions `\w` does not match `_`, and `\s` is space, tab, line feed and carriage return.
- A `let` value is worked out on first use when it can be several items and does not read the context item,
  or when the variable is read at most once outside a loop; otherwise at the declaration. A query that fails in
  PMD on a value it never uses therefore fails here too.
- `matchesSig` compares the parameter types after type arguments are filled in; a single-type import names a
  class even when its jar is missing; columns count UTF-16 units.

## Not done yet

- `tests/rules/all.json` is generated but checked in; a Java run builds its rule list from the rulesets.
- The rules PMD implements in Java (#2031) still run in PMD. A Java run does not start the engine's Error
  Prone, NullAway and SpotBugs checks yet.
- The JDK classes are read from `jmods`; a JDK without that folder leaves all rules to PMD.
- A type question that needs more than 20,000 resolution steps is answered "unknown" (29 on Elasticsearch).

## TypeScript structure and reuse facts

The TypeScript structure analyzer asks the engine for the function and class metrics (`typescript-structure`) and
for the definitions, imports, exports and near-duplicate units the reuse rules read (`typescript-reuse`). Imported
names in the units keep their module specifier; nitpicker resolves them to modules afterwards. A file the engine
cannot read the way the TypeScript compiler does is marked `unparsed`, and nitpicker reads that file, and any file
whose path holds a tab or a line break, with the JavaScript analyzer. `NITPICKER_STRUCTURE_ENGINE=off` reads every
file that way; `NITPICKER_STRUCTURE_ENGINE=required` fails instead when the engine is missing or stops.

## TypeScript checks that need types

The engine has no TypeScript type system. A check that needs types reads the tree the TypeScript compiler's
API server (`tsc --api`, TypeScript 7) parsed and asks that server over a pipe: symbols, types, signatures and
type text, by node, alone or in batches (`src/typescript/types/`). All checks of a run share one server and
one loaded project.

```
nitpicker-engine typescript-typed --compiler <tsc of TypeScript 7> --project <tsconfig.json> --checks <name,name>
    [--input <check>=<json file>] [--all-reads] [--out <file>]
nitpicker-engine typescript-type-replay --compiler <tsc> --project <tsconfig.json> --questions <jsonl> --kinds <json>
```

| Check | What it is |
| --- | --- |
| `public-contracts` | The public contract usage check of `coding-standards`. It asks the compiler only about member reads named like a contract method; `--all-reads` asks about every read. An optional `--input` names the own root (`{"ownRoot": "<folder>"}`), for a workspace package whose program holds the whole workspace: contracts then come only from classes and interfaces under it, and uses still count from every production file. |
| `unused-api` | The unused option and unused prop check. nitpicker decides which files the program has and what role each plays and passes that with `--input`; the engine returns the targets, their members and the references it found, and nitpicker turns them into findings. |
| `design` | The facts of the design signals check: the project's types with their fields, and its callables with their parameters, calls, reads and decisions (`src/typescript/typed/design/`). nitpicker names the files that count with `--input`, marks what is published and evaluates the rules. |

`structure` asks for `unused-api` and `design` in one call when both build the same project, so the program is
loaded once and types both checks ask about are computed once.

Exit status 3 with `types unavailable: <reason>` on standard error means the compiler cannot answer here (no
binary, a version the engine's tables were not generated from, a project that does not load, a compiler option
TypeScript 7 removed such as `baseUrl` or `moduleResolution: node10`): nitpicker then runs the check with the
JavaScript compiler in its own process. `NITPICKER_TYPED_ENGINE=off` always does that; `NITPICKER_TYPED_ENGINE=required` fails
instead when the engine or the compiler is missing or the engine stops in any other way.

`typescript-type-replay` asks the compiler the questions `parity/typescript-type-questions.mts` recorded from
the plugin rules and counts matching answers; `--kinds` is the compiler's `SyntaxKind` table as JSON.

In a JavaScript file TypeScript 7 turns documentation comments into syntax (a parameter's type from `@param`,
a type alias from `@typedef`). The JavaScript compiler's tree has no such nodes, so the tree reader leaves
them out.

Where a union lists the same property in several members, the unused API check reports the declaration that
comes first by file name and position. The two compilers order union members differently, so the check in
nitpicker's own process uses the same rule.

The design facts do not depend on the order a compiler lists things in either: type text has the members of
every union and every object type sorted, and the fields of a type are listed by the file and position of
their declarations. A return type is read from a comment only in a JavaScript file. The engine hands a project
back when a JavaScript file of it has types in documentation comments, or a property is declared by
assignment. The generated project names the type roots of the original one, so `/// <reference types>` lines
find the same packages.

Measured on Grafana, 4 cores (wall, CPU, peak memory of the process tree; findings identical in every row):

| Project | Node check | Node, only named reads | Engine | Engine, `--only-named` |
| --- | --- | --- | --- | --- |
| Root application, 6,364 production files, 61 findings | 65.0 s, 86 s, 4.4 GB | 43.2 s, 61 s, 3.7 GB | 26.9 s, 44 s, 4.3 GB | 14.5 s, 29 s, 3.4 GB |
| `grafana-ui`, 1,185 production files, 58 findings | 10.2 s, 19 s, 1.0 GB | 6.9 s, 13 s, 0.9 GB | 4.0 s, 8 s, 0.9 GB | 1.8 s, 4 s, 0.7 GB |
| The 15 packages with a tsconfig, 216 findings | 53.3 s, 101 s | | | 10.8 s, 30 s |

Unused option and unused prop check on the same machine, whole nitpicker call (findings identical):

| Project | Node check | Through the engine |
| --- | --- | --- |
| Root application, 2,378 targets, 17 findings | 49.8 s, 68 s, 3.8 GB | 32.2 s, 48 s, 4.5 GB |
| `grafana-ui`, 331 targets, 9 findings | 10.0 s, 17 s, 1.0 GB | 6.1 s, 10 s, 1.1 GB |

Of the 32.2 s, 24.6 s is the engine waiting for the compiler's answers to 275,680 questions.

Nearly all of the engine's time is the compiler computing types, on one thread; a question costs about 10
microseconds on the pipe once its type is known. Types the server computed for diagnostics are not reused for
questions.

The 42 type-aware plugin rules ask 134,885 distinct questions about nodes on `grafana-ui`. The native compiler
gives the same answer as the JavaScript compiler for 132,720 (98.4%); 2,058 differ only in the order of union
members or properties in the type text, or in the escaping of names that start with two underscores; 107
(0.08%) differ in substance (index-signature symbols, the declaration node of a property assigned onto a
function, standard library versions).

## Error Prone checks

`--rules _ErrorProne` runs checks written after Error Prone 2.50.0 (`src/java/errorprone/`): `OperatorPrecedence`,
`UngroupedOverloads`, `MissingBraces`, `EmptyCatch`, `NonFinalStaticField`, `ThrowSpecificExceptions`, `SystemOut`,
`JavaUtilDate`, `StringCaseLocaleUsage`, `MissingOverride`, `ReferenceEquality`, `PrivateConstructorForUtilityClass`
and `InconsistentOverloads`, and the ones added since: `parity/errorprone/ported.json` lists every check. A finding carries the check, the line and column javac reports for it, and the
message; `@SuppressWarnings` with the check name or `all` hides it. `NP_EP_ONLY=<check>` runs one check.

`tests/expected/errorprone.json` holds what Error Prone reported for `tests/fixtures/errorprone`. For a real
project, `parity/errorprone/ErrorProneRun.java` compiles a source list with Error Prone and writes its findings
and the time of each check, and `parity/errorprone/compare.py report.json ep.json [check] [-v]` compares.

`ImmutableEnumChecker` runs only when `com.google.errorprone.annotations.Immutable` is among the classes of the
project, since nitpicker turns the check off in Error Prone when the annotation is out of reach. The fixtures
carry their own copy of the three annotations the check reads; to run Error Prone on them, put an entry whose
path contains `error_prone_annotations` on the class path so `ErrorProneRun` leaves the check on.

The checks are ports of Error Prone's (Apache-2.0, see `NOTICE` at the root of the repository). The doc comment
parser under them (`doc.rs`, `docparse.rs`, `doctags.rs`, `docref.rs`) is written from the Documentation Comment
Specification for the Standard Doclet. `tests/expected/doctrees.txt` holds the trees javac 21 builds for
`tests/fixtures/doctrees`, printed through the public `com.sun.source.doctree` API by
`parity/errorprone/DocTreeDump.java <source list> <out>` (run from the fixture folder), and a unit test compares
them part by part. `NP_DOC_TREES=<dump of any code base, absolute paths> cargo test --release doc_comments`
compares a whole code base the same way.

Measured on 4 cores against Error Prone running only these checks (findings: same / missed / extra):

| Code base | Files, lines | Error Prone wall, CPU, peak | Engine | Findings |
| --- | --- | --- | --- | --- |
| Elasticsearch `server` | 5,106, 1,035k | 26.5 s, 75.6 s, 3.4 GB | 7.8 s, 28.6 s, 0.5 GB | 5,476 / 4 / 0 |
| Nacos | 3,118, 548k | 13.4 s, 42.3 s, 1.5 GB | 5.5 s, 13.1 s, 0.3 GB | 4,837 / 7 / 7 |
| javaparser-core | 594, 121k | 7.8 s, 24.2 s, 0.9 GB | 1.0 s, 3.5 s, 0.1 GB | 5,399 / 0 / 6 |
| Guava | 610, 183k | 7.2 s, 22.8 s, 0.8 GB | 1.1 s, 3.8 s, 0.1 GB | 198 / 0 / 0 |
| jackson-databind | 478, 134k | 5.0 s, 16.0 s, 0.5 GB | 0.8 s, 2.7 s, 0.1 GB | 1,130 / 0 / 0 |
| commons-lang | 264, 106k | 3.3 s, 10.6 s, 0.4 GB | 0.5 s, 1.5 s, 0.1 GB | 302 / 0 / 0 |
| MyBatis | 393, 40k | 3.3 s, 10.6 s, 0.4 GB | 0.3 s, 0.9 s, 0.1 GB | 155 / 0 / 0 |

`--release <n>` gives the Java release the sources are compiled for. When it is older than the JDK, the type
index reads the library of that release from the JDK's `lib/ct.sym`, as javac does, so a `List` method added in
Java 21 is not there for code compiled with `--release 17`. With it (javaparser-core is built for 17) the seven
code bases give the same findings as Error Prone; the differences in the table were type questions closed since
it was measured.


## SpotBugs patterns

`--rules _SpotBugs` runs bug patterns rebuilt after SpotBugs 4.9.8 (`src/java/spotbugs/`). SpotBugs is LGPL: each
pattern is rebuilt from its documented meaning and from what SpotBugs reports on test code written for the
purpose, and its source is not read. A finding carries the SpotBugs pattern name, line and message;
`@SuppressFBWarnings` with the pattern name, or without a value, hides it. `NP_SB_ONLY=<pattern,...>` runs some.

Done: `EI_EXPOSE_REP`, `MS_EXPOSE_REP`, `EI_EXPOSE_REP2` and `EI_EXPOSE_STATIC_REP2` (#2098) and
`CT_CONSTRUCTOR_THROW` (#2112), together 76% of what SpotBugs with FindSecBugs reports on the seven code bases
below, and the statement patterns of #2113 (see "Statement patterns"). The rest is planned in #2097.

`tests/expected/spotbugs.json` holds what SpotBugs reported for the compiled `tests/fixtures/spotbugs`; each
fixture folder is one experiment on SpotBugs' behaviour. `parity/spotbugs/run.sh` runs SpotBugs the way a Java
run does, `rows.py` turns its XML report into rows and `compare.py report.json spotbugs.xml <patterns>
[sources.txt] [-v]` compares by pattern, file, line and message.

Measured on 4 cores (findings: same / missed / extra, exposed representation then constructor throw). SpotBugs
runs all its patterns and needs compiled classes first (31 s for Elasticsearch `server`); the engine column is
these five patterns from source:

| Code base | Files, lines | SpotBugs wall, CPU, peak | Engine | Exposed representation | Constructor throw |
| --- | --- | --- | --- | --- | --- |
| Elasticsearch `server` | 5,106, 1,035k | 249 s, 417 s, 3.2 GB | 8.0 s, 28.9 s, 0.5 GB | 4,330 / 5 / 1 | 1,539 / 0 / 0 |
| Nacos | 3,118, 548k | 108 s, 242 s, 2.9 GB | 5.6 s, 18.0 s, 0.3 GB | 2,440 / 0 / 6 | 85 / 0 / 0 |
| javaparser-core | 594, 121k | 48.3 s, 97.2 s, 2.3 GB | 0.9 s, 3.0 s, 0.1 GB | 500 / 0 / 0 | 17 / 0 / 0 |
| Guava | 610, 183k | 43.6 s, 99.8 s, 1.8 GB | 1.3 s, 4.3 s, 0.1 GB | 14 / 0 / 0 | 0 / 0 / 0 |
| jackson-databind | 478, 134k | 35.7 s, 78.2 s, 1.7 GB | 0.9 s, 3.3 s, 0.1 GB | 224 / 0 / 0 | 17 / 0 / 0 |
| commons-lang | 264, 106k | 19.9 s, 50.5 s, 1.2 GB | 0.7 s, 2.2 s, 0.1 GB | 15 / 0 / 0 | 17 / 0 / 0 |
| MyBatis | 393, 40k | 15.5 s, 50.3 s, 0.9 GB | 0.4 s, 1.2 s, 0.1 GB | 173 / 0 / 0 | 32 / 0 / 0 |

Exposed representation, 12 differences (7,696 same):

- A field that only ever takes a parameter, read back from another object and stored, 1 constructor missed.
- A field of the superclass returned through a field typed with that superclass, 1 missed.
- 10 not explained yet (tracked in #2098). The engine reports alone: 4 getters of one protobuf-generated builder
  whose field is typed `Object` and only ever takes one message type, 2 getters of a protobuf-generated message
  whose place in the visiting order among classes that call each other is not known, and 1 other getter. Only
  SpotBugs reports: 3 getters over a field that takes nothing but `Map.of` or `Map.copyOf` results, two of
  them in a subclass of the class with the field. Small classes of the same shape do not reproduce them.

Constructor throw: no differences (1,707 same).

Measured again on 2026-11-26 with every pattern of this section and the statement patterns (13 patterns), on the
five libraries, Nacos at its current commit, mall (Spring Boot with Lombok) and the Kafka `generator` module: all
the same except 2 getters of Nacos' protobuf-generated `TrafficPolicy` the engine reports alone (visiting order
among classes that call each other). The 4 `Delay$Builder` getters are explained by the class-literal rule below.
Elasticsearch could not be built for this run.

A class whose `Class` object the code names anywhere (`X.class`, a logger made from it, or an `assert`, which reads
the class literal of its top-level class) loses what SpotBugs learned about the types stored in its fields
(`literals`): a field declared with an unchangeable type is no longer reported for the one changeable type stored
in it, and of the `c ? a : b` table only the rows that compare the two producers by name (`List.of()` against
`List.copyOf(x)`, two `unmodifiableList(...)` calls) turn to changeable.

A private field that holds nothing but parameters, stored in a constructor (or any static field), counts as a
parameter when another field is given its value (`held`): `other = raw` is reported as `EI_EXPOSE_REP2` with the
variable `?`. One store of anything else, in any method or constructor, ends it; a field stored only in instance
methods never counts.

What SpotBugs counts as "an exception can leave the constructor", as measured (`tests/fixtures/spotbugs/ctor_*`):
a `throw` or `assert` the handler around it does not take; a call to a method that declares exceptions; a call
to a method of the same class from which one of those can leave, however deep; `this(...)` to a constructor with
one of those, one level deep. Not counted: calls to constructors, to undeclared methods of other classes, anything
before the first constructor call of the body (which a `new` among the arguments of `super(...)` already ends),
and a rethrown `Throwable`. Final classes, enums, records and classes with a final `finalize()` are exempt.
An anonymous class is reported for what its field initializers and initializer blocks can throw, under the
constructor the compiler writes for it (`new p.Outer$1(Outer, int)`); what the constructor of its superclass
throws does not count (`tests/fixtures/spotbugs/ctor_anonymous`).

Only the innermost handler around a place is asked, as the compiled exception table lists it
(`ctor_finally`, `ctor_nested`, `ctor_order`, `ctor_helpers*`): the `catch` clauses of the nearest `try`, and an
outer `try` never. A `try` with a `finally` block and no `catch`, a `catch` block of a `try` with `finally`, and
a `synchronized` block let everything through. The body of a `try` with resources lets nothing through, and
the `close()` the compiler adds after it counts as a call under the `catch` clauses of that `try`. In a
constructor one matching `catch` clause is enough; for a call in a method every `catch` clause of the `try`
has to take the exception. That `close()` is reported on the last line of the body of the `try`.

A class missing from the class path is one SpotBugs cannot follow (`ctor_missing`): a `throw` of an exception
class it cannot find, and the closing of a resource whose class it cannot find, do not count.

How a field counts as holding only unchangeable values (`loads*`, `visits`, `values`, `across`, `calls`):

- Stores are gathered over the whole run, from every file, while the files are checked; a getter that hangs on
  them is decided after the last file (`known.rs`).
- For a getter in class G, the stores G makes and the stores of classes visited before G are asked first: one
  changeable value among them and the getter is reported, otherwise one unchangeable value (`null` too) and it
  is not. When they say nothing, all stores of the run are asked: no changeable value and at least one
  unchangeable value other than `null` and the getter is not reported.
- A call result that is stored counts as changeable, whichever class the method is in, unless the call is one
  of the library calls known to make an unchangeable value (`List.of`, `Map.copyOf`,
  `Collections.unmodifiableList` and their like).
- A field of an unchangeable declared type that every store of the run gives one changeable type is reported;
  `null` stores are passed over and a store whose type is not known ends it.
- Classes are visited in the order of a Java `HashMap` keyed by the class name with slashes, sized for the
  number of classes in the run. A class is put off until all others are done when it calls a method or
  constructor that takes or returns an object, of a class of the run that is not an interface and was not
  visited yet; methods `Object` declares and calls between classes that call each other in a circle put
  nothing off. Classes put off are visited last one first (`order.rs`, `calls.rs`).
- What counts as such a call, as the compiled form has it: the constructor of an inner class (it takes the
  outer object) and of an anonymous class outside a static place or with arguments; `super(...)` and
  `super.m()` go to the superclass, a bare `m()` to the nearest class around that has an `m`; a call belongs
  to the innermost class around it. The engine asks the overloads of that name and argument count and
  resolves the call only when they disagree. A call into a class in the same `HashMap` slot puts the caller
  off.
- A value read from another field is fine when that field was given an unchangeable value at least once, anywhere in
  the run. The field read back into itself (`this.f = other.f`) says nothing, and counts against the field when it
  went through a local variable first.
- A local variable with two values is judged the way `c ? first : second` is.

Also measured: the accessor of a record's varargs component is reported and its constructor is not; a pattern
variable of `instanceof` holds the tested value; one parameter stored twice in a field of one method is one
finding; the outer-instance field of an inner class is `this$N`, N counting the inner classes around the outer
one; the line of an inner-class constructor is the line of its opening brace.

Known gaps in what is rebuilt: `c ? a : b` stored in a field follows a table measured on SpotBugs, which decides by
the compiled form (`tests/fixtures/spotbugs/choices*`); a local variable with more than two values is taken as
changeable, and so is a value more than 8 local variables or 256 nested values deep; a branch SpotBugs finds dead
because it compares a field nothing writes with a constant is still looked at; a call that is the very first
instruction of a `finally` block is still covered by the handler before it in the compiled form, which the engine does
not rebuild. Of the visiting order: two classes in the same `HashMap` slot are taken as neither before the other; the
classes the compiler adds for a `switch` over an enum, the bodies of enum constants, and the calls the compiler adds
(the iterator of a `for` over a collection, the constructor call of an inner superclass) are not counted, and neither
is a call on a lambda parameter without a declared type inside nested call arguments, which costs seconds per file to
resolve. `NP_SB_CALLS=<file>` writes the calls the order is built from; `parity/spotbugs/calls.py` reads the same from
class files and compares (Nacos: 10,350 same, 76 only in class files, 2 only in the engine).

A stored value also carries the variable SpotBugs names as the place of the finding (`symbol` in the report,
`<method>#<variable>`, `tests/expected/spotbugs-variables.json`): the first variable, parameters first and then
locals in the order they are declared, that holds the very value stored, so a copy of a parameter or a cast or
pattern variable of it is named after the parameter; a variable given different values on two paths is named
itself; a value only a call made (`Objects.requireNonNull(p)`) or a `?:` choice right in the store is `?`; the
outer instance of an inner class is `this$N` and a record component its own name.

### Null patterns

`src/java/spotbugs/nulls/` follows values through a method on the flow graph of `src/java/flow/`: a backward
pass finds where a value is dereferenced whichever way the flow goes, a forward pass carries what is known about
each local variable and field. Compared with SpotBugs on seven code bases (same / missed / extra, the three
patterns together):

| Code base | Same | Missed | Extra |
| --- | --- | --- | --- |
| commons-lang, guava | 0 | 0 | 0 |
| jackson-databind | 5 | 0 | 0 |
| mybatis-3 | 1 | 0 | 0 |
| javaparser-core | 6 | 0 | 0 |
| Nacos | 13 | 0 | 0 |
| Elasticsearch `server` | 618 | 29 | 73 |

On Elasticsearch `server` by pattern:

| Pattern | Same | Missed | Extra |
| --- | --- | --- | --- |
| `NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE` | 526 | 20 | 66 |
| `NP_NULL_ON_SOME_PATH` | 92 | 9 | 7 |
| `NP_ALWAYS_NULL` | 0 | 0 | 0 |

The engine with all its SpotBugs patterns takes about 22 s wall, 75 CPU s and 0.64 GB at its peak on that code
base (4 cores), 5 s more than without the work across files; SpotBugs with all its patterns takes 249 s, 417 CPU s
and 3.2 GB after a 31 s compile. The null pass runs once per file, a body nothing in which can be null is skipped
after a glance at its text, and what a method of another file does is worked out only when a call hands it a
value that matters, then kept for the run.

An `NP_ALWAYS_NULL` finding carries the place and arguments SpotBugs' SARIF gives (#2509): the local variable, or
for a field the field under the class of the method that reads it, and the name and method; dereferences on one line
that name the same place are one finding. A
`CT_CONSTRUCTOR_THROW` finding names its constructor the same way, also for what a field initializer throws.

What SpotBugs does, as measured (`tests/fixtures/spotbugs/null_*`, 240 findings of these patterns, all the same):

- Only `@CheckForNull`, or an annotation whose own declaration carries `@CheckForNull` (a nickname, as measured
  with `@TypeQualifierNickname` beside it), marks a method result or a field. `javax.annotation.Nullable` and
  other annotations named `Nullable` that are not such nicknames do nothing. The
  mark is inherited from an overridden method, and a record component hands it to its accessor and field.
- A few JDK methods count as returning null (`File.list` and `listFiles`, `Path.getFileName`, `getParent` and
  `getRoot`, `Reference.get`, `ReferenceQueue.poll`, `Files.probeContentType` and a few more), looked up by the
  receiver's class and then the classes and interfaces above it. `src/java/spotbugs/nulls/jdk-nulls.tsv` holds
  them, the JDK methods that never return null and the JDK parameters SpotBugs takes as dereferenced; it was
  made by calling every public method of `java.base` in lab code and reading what SpotBugs reported.
- A value that only may be null is reported where it is dereferenced, as long as it is dereferenced whichever
  way the flow goes from where it arose. `return` and `throw` are ways without a dereference; an exception
  thrown by a call is not a way. A value that is certainly null (from `null`, or on the null side of a test)
  stays reportable past a split.
- A dereference is a call on the value, a field or array access, unboxing, `synchronized`, `throw`, the iterable
  of a `for`, a `switch` on it, and handing it to a method that dereferences that parameter on every way through
  (static, private, final or not overridden; followed through further calls, in this file, in other files of the
  run, and in the JDK table).
- A method whose every return gives a value never null (a new object, a string, or a call to such a method, in
  this file, another file or the JDK) makes the null side of a test of its result impossible, so nothing on that
  side is reported. Other files are worked out in two rounds: the first knows nothing of calls into further
  files, the second uses the first; a third round changes nothing on the code bases above.
- What is known of a `final` field stays known across calls. What is known of another field of `this` ends at a
  call on `this` (also `super.` and `this(...)`), a call or constructor handed `this` and a `synchronized` block;
  the field then counts as read again at that point. A `volatile` field is read anew each time.
- The test of an `assert` is run (where it fails, its message is made and the method ends as at a `throw`), and
  past any `assert` a value that only may be null is no longer reported.
- Lambda bodies are not reported by these three patterns; anonymous classes, constructors, initializers and field
  initializers are.
- Several results of one method dereferenced on one line make one finding.

Differences on Elasticsearch `server`, 100:

- `Path.getFileName()` and `Path.getParent()` dereferenced, 47 extra: SpotBugs reports them in lab code, in
  Nacos, and in an Elasticsearch class analysed alone, but not when the Elasticsearch classes are analysed
  together; which classes turn it off is still being narrowed down.
- A value arising after several null tests in a row, 6 extra: SpotBugs drops it (a field then gets
  `NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE`). The experiments show three tests in a row are enough, and that
  calls, other branches, loops and tests of method results in between each weaken it by a different amount; no
  rule tried so far fits both the experiments and this code base, so none is built in.
- A helper that always throws, 2 extra: SpotBugs knows the call does not return.
- `switch` with `case null`, 1 extra.
- Not looked at one by one yet: 31 missed and 13 extra. One known cause among them is which calls end what is
  known of a field that is not `final`: lab code shows a call handed `this` keeps it when the method returns a
  value and writes no field, and ends it when the method returns nothing, is abstract or inherited, or is one of
  a few JDK methods (`getClass`, `notifyAll`, a collection's `add` or `put`, `StringBuilder.append`). Not built
  in yet.

#### Redundant tests, known nulls, `Boolean` and `equals`

`src/java/spotbugs/nulls/redundant.rs` reports from the same forward pass `RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE`,
`RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE`, `RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE` and
`NP_LOAD_OF_KNOWN_NULL_VALUE`; `src/java/spotbugs/methods/` holds `NP_BOOLEAN_RETURN_NULL` and
`NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`. All six are exact on the six smaller code bases above. On Elasticsearch
`server`:

| Pattern | Same | Missed | Extra |
| --- | --- | --- | --- |
| `RCN_REDUNDANT_NULLCHECK_OF_NONNULL_VALUE` | 29 | 4 | 1 |
| `RCN_REDUNDANT_NULLCHECK_OF_NULL_VALUE` | 0 | 2 | 0 |
| `RCN_REDUNDANT_NULLCHECK_WOULD_HAVE_BEEN_A_NPE` | 3 | 2 | 2 |
| `NP_LOAD_OF_KNOWN_NULL_VALUE` | 14 | 2 | 0 |
| `NP_BOOLEAN_RETURN_NULL` | 10 | 0 | 0 |
| `NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT` | 2 | 0 | 0 |

`NP_BOOLEAN_RETURN_NULL` and `NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT` run on the engine in real runs, with SpotBugs'
priority and SARIF place (the method; the `equals` parameter); SpotBugs no longer runs `BooleanReturnNull`. The
other four stay with SpotBugs until Elasticsearch is exact.

What SpotBugs does, as measured (`tests/fixtures/spotbugs/null_methods`, `null_redundant`, `null_repeated`,
`null_copies`, `null_asserts2`, `null_lambdas`):

- A comparison with `null` of a value already known is reported by what is known and by where the way the test
  rules out leads: code of its own, a place other ways reach too, or a `throw` (an `assert` that fails counts as
  one). Known from a dereference: high / medium / medium priority; proved by an earlier test: high / medium / not
  reported; created here (`new`, a string, `this`, a method that never returns null): medium / not / not.
- A created value that is then tested counts as proved by that test from then on. Of all the tests one value makes
  redundant, only the one with the highest priority is reported, the first of them on a tie.
- A variable copied from another variable or from a field holds the same value: a test or dereference of one
  tells about all, and the message names the first local variable holding it (parameters first), else the field.
- `x == null ? 0 : 1` and `x == null ? false : true` only turn the test into a number: not a test.
- Handing a value to `this(...)` or `super(...)` whose constructor dereferences it dereferences it.
- The line of a test or a read is the line of its statement, moved on by each method call that finished before it
  and by the condition of a `?:` or a loop it is in (the line of the condition's operator).
- Lambda bodies are methods of their own here: their redundant tests and reads of known nulls are reported.
- A read of a local variable known to be null from a comparison is reported once per such null, where it is
  first read, unless it goes straight to `return`.
- A comparison with `null` of the result of a call that never returns null (`toString()`, `getClass()`, ...) is
  reported where the way it rules out is code of its own. A static field just given a new value is not.
- For `NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT` (also `tests/fixtures/spotbugs/bc_equals*`, `null_equals_this`): at
  an `instanceof`, a comparison with `null`, `Objects.isNull` / `nonNull`, or an `if` whose condition is
  `this == o` or `o == this` (not `!=`, not inside `||` or `return`), only the way a null argument takes counts,
  also when a copy of it is tested; a comparison with `null` whose two ways meet right away ends it, as does locking
  on it. A dereference in a `finally` body, in a `synchronized` block, or where a `catch` of `NullPointerException`,
  `RuntimeException` or `Exception` (not `Throwable`) or a `finally` would see it does not count.
- `NP_BOOLEAN_RETURN_NULL` is high priority for a method whose name starts with `is`;
  `NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT` for a final method, a final class or a record.

Differences on Elasticsearch `server`, 13: three `assert` tests of a value from a method that never returns null
(`ProjectResolver` 48, `ValuesSourceRegistry` 175, `EscfDoubleColumn` 38) that lab code with the same shape does
not reproduce; two tests of fields known null (`DesiredBalanceComputer` 649, `AbstractTSDBDocValuesProducer`
3266); two line numbers of a `?:` test spread over lines (`RestTasksAction` 141); a parameter dereferenced by a
call before a test that SpotBugs does not count (`RestCatComponentTemplateAction` 117); and 5 not looked at one by
one yet.

Not rebuilt yet: `NP_NULL_PARAM_DEREF` and its variants, `NP_GUARANTEED_DEREF`,
`NP_NULL_ON_SOME_PATH_EXCEPTION`, `NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE` and
`NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE`.


### Dead stores

`src/java/spotbugs/dead/` rebuilds FindDeadLocalStores: `DLS_DEAD_LOCAL_STORE`,
`DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD`, `DLS_DEAD_LOCAL_STORE_OF_NULL`, `DLS_DEAD_STORE_OF_CLASS_LITERAL`,
`DLS_DEAD_LOCAL_INCREMENT_IN_RETURN` and `IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN`. On the seven code bases all 71
findings SpotBugs reports are the same (Elasticsearch `server` 17, Guava 20, javaparser-core 21, Nacos 12,
jackson-databind 1). They run on the engine in real runs, with SpotBugs' priority and SARIF place (the variable);
SpotBugs no longer runs FindDeadLocalStores, except in modules where Lombok runs. `NP_SB_LOW=1` also reports
priority 3, which SpotBugs shows with `-low`, for comparing with lab runs.

What SpotBugs does, as measured (`tests/fixtures/spotbugs/dead_stores*`, all priorities):

- A store is dead when no way from it reads the variable. Exception handlers count: a call reaches the handlers of
  unchecked exceptions and of what it declares; a division or remainder of whole numbers (by a constant too), an
  array access or `length`, a reference cast, boxing, `new`, a field of an object other than `this`, string
  concatenation, a lambda or method reference, `synchronized` and `throw` reach handlers of runtime exceptions.
  Static fields, fields of `this`, other arithmetic and `instanceof` throw nothing. What a lambda or a class in
  the method reads counts where it is made; lambda bodies are not looked at. `assert false` always throws, and
  code nothing reaches is not reported. Where the method can never end (a loop that neither leaves nor has an
  instruction that can throw), nothing counts as read or stored later: every store there is dead.
- Not reported on the line where javac starts the handler of a `synchronized` block (its closing brace) or of a
  `finally` (its first statement; its closing brace when it is empty and the `try` has a `catch`), when code of
  another line follows that handler in the compiled method. `IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN` is still
  reported there.
- Not reported: a constant, judged by the last instruction before the store (a `?:` or a `switch` by its last
  arm, a `?:` with a known condition by the arm javac keeps, a `final` field with a constant value read through
  an object too; `&&`, `||`, `!` and comparisons count, `instanceof` does not), except a `long` or `double` other than 0 and 1 in a slot with
  more than one store; the exception of a handler and copies of it; resources; the variables of `switch` patterns;
  the parameters of a compact constructor. Names such as `unused` or `ignored` do not matter.
- `null` is `DLS_DEAD_LOCAL_STORE_OF_NULL`, low priority (not shown) except for a parameter whose value is never
  read; a class literal is `DLS_DEAD_STORE_OF_CLASS_LITERAL`, medium; `return i++` on an `int` is
  `DLS_DEAD_LOCAL_INCREMENT_IN_RETURN`, medium, high for a parameter.
- Priority of the rest: medium, high for a parameter and for a variable named as an instance field of the class
  of an instance method (`DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD`; inherited and static fields do not count), always
  high for a parameter whose value is never read. A new object or array (not one filled in braces) raises it one
  step; it drops one step each for a read of an instance field (not one the store converts), a copy of a variable whose value is a number other
  than `long` or `double`, a `boolean` or a string (a conversion is no copy), a store after which another store
  to the same javac slot can come (in a loop, over an exception edge, by a variable reusing the slot), a slot with
  four stores or more, and a dead `++` on a slot with two or more.
- `IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN`: a parameter whose value is never read and that is stored to, on its
  first store: high when that store is dead, medium when it is a dead constant, low when it is read.
- Slots are javac's: parameters first (after the enclosing instance of an inner class's constructor, and the name
  and position of an enum's), a block's slots freed when it ends, two for `long` and `double`, hidden slots for
  `for` over an array (three) or a collection (one), `switch` on strings or patterns (two), `synchronized` (one,
  and one for the lock of Lombok's `@Synchronized`).
- One finding per method, pattern, name and priority, on the first line; `SHADOWS_FIELD` merges the priorities,
  on the line of the best. The line is the statement's (a declaration's own line), moved on by calls finished
  before the store. A variable javac's table of names does not cover right after the store is named `$L` and its
  slot (place `?`): a declaration that is the last code of a nested block, a `for` variable whose body is empty, a
  first assignment that is the last code of a branch javac leaves without a jump.

Known difference, in labs only: when sibling `if` and `else` branches store with the same priority, SpotBugs
sometimes reports the `else` line (`long` constants).

### Statement patterns

Patterns that look at single statements or at one method's switches (`src/java/spotbugs/statements/`), measured on
the same seven code bases (same / missed / extra, all seven together):

| Pattern | Findings |
| --- | --- |
| `DCN_NULLPOINTER_EXCEPTION` | 26 / 0 / 0 |
| `JLM_JSR166_UTILCONCURRENT_MONITORENTER`, `JLM_JSR166_LOCK_MONITORENTER` | 35 / 0 / 0 |
| `PREDICTABLE_RANDOM` (FindSecBugs) | 41 / 0 / 0 |
| `VO_VOLATILE_INCREMENT` | 22 / 0 / 0 |
| `WMI_WRONG_MAP_ITERATOR` | 33 / 0 / 0 |
| `SF_SWITCH_FALLTHROUGH`, `SF_SWITCH_NO_DEFAULT` | 52 / 0 / 0 |

With these the engine takes 13.2 s wall, 46.6 CPU s and 0.6 GB on Elasticsearch `server`, 10.2 s on Nacos.

What was measured (fixtures `tests/fixtures/spotbugs/stmt_*`):

- Lock patterns use the type a field was given, not its declared type. SpotBugs forgets those types for a class
  whose class literal (`X.class`) appears anywhere in the analysed code, and an `assert` reads the class literal
  of its top-level class; the declared type is used then. A parameter typed by a type variable is never reported.
- `PREDICTABLE_RANDOM`: `new Random(...)`, `ThreadLocalRandom.current()`, `Math.random()`, also inside lambdas, and
  every constructor of a class that extends `java.util.Random` (at `super(...)`, or at the constructor or class
  line when the call is implicit).
- `VO_VOLATILE_INCREMENT`: `++`, `--`, `+= 1`, `-= 1` (only `+= 1` for `long`) and `f = f + 1` on a volatile
  `int` or `long` instance field, when the value is not used.
- `WMI_WRONG_MAP_ITERATOR`: a `get(key)` on the map whose `keySet()` produced the key (enhanced `for`, an
  iterator's `next()`), not for `TreeMap`'s sorted siblings, `EnumMap` or `ConcurrentHashMap`; once per method
  and map field, plus once for all local maps.
- The switch patterns read the compiled switch, so the cases are laid out the way javac emits them: a `break`
  at the very end emits nothing, pending jumps join the `break` that follows, a block that declares variables
  ends on its closing brace, a loop's back jump counts as running on, `finally` and `synchronized` end in a
  rethrow, and a jump that lands on a loop's back jump becomes a jump back. A fall through is reported when a
  method has fewer than 4 of them in all its switches, or one stores a field the next case stores again. The
  default is missing when the code before the default jump target runs on into it and no forward jump goes
  further; a loop's back jump counts too when javac emits a table with holes (they jump to the default). A last
  `case null -> {}` in a pattern switch is a fall through for SpotBugs.

Each of these findings carries what SpotBugs' SARIF names (#2418, `src/java/spotbugs/place.rs`): the method,
the field (a map field for the map-iterator pattern) or the local, and the priority that sets the SARIF level
(`JLM_JSR166_LOCK_MONITORENTER` is priority 1, the others 2). A finding in a field initializer or an initializer
block is named once for each constructor that does not start with `this(...)`, or for the static initializer;
a finding inside a lambda names the lambda's method. A lock finding lists the lock's type and the method, as
SpotBugs does (#2474): a lock on `this` names the local `this`, one on `Outer.this` the `this$<depth of Outer>`
field javac reads last (in a constructor of the class just inside `Outer`, the constructor's parameter of that
name), and SARIF names a lock field under the class of the method that reads it, keeping the field's package in the
name when it is not the method's. Locks on the same line that name the same place are one finding
(`tests/expected/spotbugs-arguments.json`). `tests/expected/spotbugs-places.json` holds the places
SpotBugs' SARIF gives for the fixtures, and the SARIF results of real runs match SpotBugs' on all seven code bases.

`REC_CATCH_EXCEPTION` is described under "Ignored results, reboxing and caught exceptions".

### Injection patterns (FindSecBugs)

`PATH_TRAVERSAL_IN`, `PATH_TRAVERSAL_OUT`, `SQL_INJECTION_JDBC`, `SQL_INJECTION_SPRING_JDBC`, `SQL_INJECTION_JPA`,
`COMMAND_INJECTION` and `LDAP_INJECTION` (#2528) run on the taint layer (`src/java/spotbugs/taint/`, model in its
`mod.rs`). FindSecBugs 1.14.0 is LGPL and its configuration files were not read: the sinks in
`taint/injection-sinks.tsv` were found by calling every public method and constructor of the JDK, servlet, JPA,
Spring JDBC and Spring LDAP classes with a parameter value and keeping those it reported, together with the sink
files nitpicker hands FindSecBugs (a test checks that each of their rows is in the table). What was measured:

- A call is a sink when the class it names in the compiled code, or any supertype of it, has a row for the
  method's name and erased parameter types; overriding changes nothing, and constructors count too (`new Sub(p)`
  of a `File` subclass, and its `super(p)`). The finding names the call as compiled: that class and the JVM
  descriptor. An anonymous class's `new` is the superclass constructor call in that class's constructor, and
  a `new` of an inner or local class is no sink, since javac adds parameters to its constructor.
- With several sink arguments, the last one whose value is not safe decides the finding alone.
- Priority 1 for a tainted value, 2 for an unknown one (both are SARIF warnings). A value that comes from a
  parameter waits for the whole run: a call anywhere that hands the parameter (also a constructor's, through
  `new`, `this(...)` and `super(...)`) a tainted value makes it priority 1, and calls that only hand safe values
  drop it.
- The line is javac's: a call's is the line of its `(`, a `new` takes the line javac started last before it (the
  statement, a declaration's or `try` resource's name, a `do` loop's condition, or a call evaluated before
  it). Findings alike in all, down to the parameters they come from, collapse into one.
- `DirContextAdapter.lookup(String)` of Spring LDAP is not a sink, although its interfaces' method is.

Measured on the labs (2,149 findings, one lab difference below) and six code bases, same / missed / extra:
commons-lang 11 / 0 / 0, mybatis 27 / 0 / 0, jackson-databind 4 / 0 / 0, javaparser-core 5 / 0 / 0, Guava
10 / 2 / 0, Nacos 246 / 0 / 3. Elasticsearch could not be built for this run. The engine needs the library jars
to resolve sink calls, so a Gradle run hands it the whole compile class path (SpotBugs there gets only the jars
the build makes, and finds most sinks by name). Known differences (#2632 for the `for` cases):

- Nacos: FindSecBugs knows the static fields of other classes it visited before, so its result depends on its
  visiting order (`TlsFileWatcher`, `SelfTrustManager`).
- Guava (`ClassPath`, `new File(entry)` over `Splitter.split(...)`): an enhanced `for` over an `Iterable` that an
  anonymous or nested class of the run implements is unknown for FindSecBugs when that class's `iterator()`
  calls other code; the engine takes the element from the value of the iterable. In the other direction, in a lab
  only, a `for` over some JDK collections made in the method (`HashSet`, `ArrayDeque`, `LinkedList`, a `keySet()`)
  is safe for FindSecBugs and unknown for the engine.

### Lombok

SpotBugs reports nothing inside the members Lombok writes when Lombok marks them with `@lombok.Generated`, which
Lombok does by default from 1.18.34 on (earlier versions only with `lombok.addLombokGeneratedAnnotation = true` in
a `lombok.config`). Real runs read the version from the `Lombok-Version` line of the jar's manifest, or from the
declared processor coordinates, and leave a module whose Lombok does not mark them to SpotBugs alone (#2595).
What Lombok changes in hand-written code matters (`tests/fixtures/spotbugs/lombok`):

- A constructor parameter marked with Lombok's `@NonNull` makes the constructor start with a null check that
  throws: `CT_CONSTRUCTOR_THROW` on the line of the parameter, after a `this(...)` call that already throws.
- A `@SneakyThrows` constructor lets nothing out of its body; field initializers still count.
- A class without a hand-written constructor whose constructors Lombok writes (`@Data`, `@Value`, `@Builder`,
  `@AllArgsConstructor`, `@NoArgsConstructor`, `@RequiredArgsConstructor`, `@SuperBuilder`) has no constructor
  SpotBugs reports.
- An annotation is Lombok's when its name is imported from `lombok` or `lombok.experimental`, one by one or with
  `*`; a single-type import of the same name from another package wins over `import lombok.*`. A varargs parameter
  marked `@NonNull` is checked like any other.

With `--lombok` (real runs pass it for a module whose only code-changing processor is Lombok), the type model
also knows what Lombok writes that the lock and map-iterator patterns need (#2400, `src/java/types/lombok.rs`):

- The getters and setters of `@Getter`, `@Setter`, `@Data` and `@Value` on a class or a field (`isX` for a
  `boolean`, `AccessLevel.NONE` turns one off, no setter for a final field or under `@Value`, a hand-written
  method of the same name, in any case, and arity or varargs wins). `AccessLevel` sets the method's access.
  `@Accessors` on the field, else on the class, sets `fluent`, `chain` (a setter that returns the object) and
  `prefix` (a field without one of the prefixes gets none); a `lombok.config` that changes accessor names
  (`lombok.accessors.fluent`, `prefix`, `capitalization`, `lombok.getter.noIsPrefix`) runs SpotBugs alone.
- `val` and `var` from Lombok take the type of their value, like Java's `var`.

With `--lombok --classes <class directories>` (real runs pass the build's class directories of the module), the
engine reads the class files javac wrote for the sources (`src/java/types/compiled.rs`) and takes from them what
Lombok wrote, the way SpotBugs sees it (#2536, fixtures `lombok_compiled_*`, their class files in
`tests/fixtures/spotbugs-classes`, written by javac 21 with Lombok 1.18.36):

- Field access bits: `@Value`, `@FieldDefaults` and `@UtilityClass` make fields private, public, final or static.
  SS_SHOULD_BE_STATIC also needs the `ConstantValue` javac writes, which `@Builder.Default` takes away, and a
  `@Getter(lazy = true)` field is no longer a `String` or a primitive.
- The constructors Lombok writes: SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR takes the first constructor in the class
  file that is not private; when Lombok wrote it, the finding sits on its line (the line of the annotation that asked
  for it) and names it from its descriptor. No non-private constructor, no finding.
- A class's first line, where class findings sit, is the lowest line of any method in the class file.
- HSM_HIDING_METHOD counts the static methods Lombok writes (static getters and setters, `builder()`) on both sides:
  a hand-written static method hides a written one and a written one hides a hand-written one.
- PA_PUBLIC_PRIMITIVE_ATTRIBUTE, MS_SHOULD_BE_FINAL and MS_PKGPROTECT count the loads and stores in the code of the
  written methods, after the hand-written members of the same kind. A written constructor also holds the field
  initializers, which the source already gives: only the code on the constructor's own line counts.
- A `@Synchronized` method is synchronized for SING_SINGLETON_GETTER_NOT_SYNCHRONIZED.

On these, Lombok modules leave the singleton, hiding and field patterns to the engine like other modules. Measured
on mall (7 modules, Lombok 1.18.46), eladmin (5 modules, built with Lombok 1.18.36) and the 315 test sources of
Lombok 1.18.36 that compile alone: the moved patterns are identical to SpotBugs at the SARIF level; the other
differences on Lombok code are listed in #2596.

Real runs decide Lombok from the processors javac uses (#2402): the declared `annotationProcessorPaths` when a
build lists them, else the `META-INF/services` entry of each classpath jar, read without unpacking the jar.
Processors that only write new files (AutoService, AutoValue, Dagger, Immutables, MapStruct, Hibernate's
metamodel, Spring's configuration processors and others) are left out. The `@Generated` mark is read the way
Lombok reads `lombok.config`: from the outermost file to the nearest, with `clear`, `import` and
`config.stopBubbling`; a module where it is off runs SpotBugs alone.

### Class patterns

`src/java/spotbugs/classes/` looks at a class as a whole. Findings on a class are placed on its first line as
SpotBugs reports it: the lowest line any of the class's methods has code on, as `javac` writes the line table
(`classes/lines.rs`). A constructor's code starts at its `this(...)` or `super(...)` call, else at the `{` of its
body; a default constructor at the `class` keyword; field initializers at the field name (copied into each
constructor that does not call `this(...)`); a static constant needs no code; a method at its first statement
that makes code (a local variable at its name, any other statement where it starts), or the closing brace of an
empty body. `javac` also marks the test of each conditional expression (at the operator of a binary test, else
`instanceof` at its keyword, else where the test starts) and each call (at its `(`); when the first
instruction of a statement comes after such a mark (the statement starts with a conditional expression, or with a call that loads nothing before it: static,
no receiver value, first argument also leading), the statement's lowest line is the lowest of those marks. An
`if` is placed the same way by its condition; a `return` always has code on its own line. A static initializer
starts at its first statement; `while`, `for (;;)` and `if` on a condition `javac` folds to `true` or `false`
(`int` literals in any base, `boolean` and `int` fields set from a literal in any class, unary, arithmetic,
bit, shift and comparison operators in 32 bits, `&&`, `||`) start at the code of the body or branch that runs,
and a conditional expression on such a test makes only the chosen branch; a `for` starts at its initializer,
else at its condition; a `do` with an empty body at its condition; a `try` with an empty body starts at its
`finally` block, else at the next statement. Not modelled: constants set from an expression, local constants,
`long`, `char` and `String` constants, the boxing and unboxing calls `javac` adds, a `for` update or for-each
variable on a line of its own, and cloneable anonymous classes (SpotBugs reports CN_IDIOM at the `new`). A static constant needs no code only when its value reads literals
and other such constants. Enums, records, classes that hold an `assert` and classes that get a bridge method (a
method overriding one of a generic supertype whose erased parameters or result differ) also have code on the
first line of the declaration, annotations included.

Singletons (#2261, labs in `tests/fixtures/spotbugs/sing*`): a class keeps an instance in a private static field
of its own type, made with `new` of exactly that class (not an anonymous subclass) in the field's initializer, a
static initializer or the method that hands it out, and a public static method returns that field (directly, through a
cast, or through a local variable with one value other than `null`). A static method that is not private,
declares the class as its result and returns a `new` instance of it means it is no singleton. Enums, interfaces and records are not looked at.

- SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR: the first constructor that is not private, at its first line;
  the default constructor unless the class is private.
- SING_SINGLETON_IMPLEMENTS_SERIALIZABLE: at the class's first line.
- A `clone()` is a thrower when it has no `return` and ends by throwing a new `CloneNotSupportedException`
  (not an anonymous subclass), written in place or kept in a local. A covariant `clone()` gets a bridge, which is
  no thrower and is placed on the class's first line.
- SING_SINGLETON_IMPLEMENTS_CLONEABLE (listed in `implements`): on the `clone()` the class defines, else on the
  class; none when that `clone()` is a thrower. SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE: on the class,
  none when its `clone()` is a thrower.
- SING_SINGLETON_IMPLEMENTS_CLONE_METHOD: a `clone()` that is no thrower, in a class that is not cloneable.
- SING_SINGLETON_GETTER_NOT_SYNCHRONIZED: a getter is lazy when a test that the field is `null` (an `if` or
  `while` on `== null`, alone or in an `&&`, or the statements after an `if` on `!= null`) leads to a store of a
  new instance before any call or `synchronized` block. With a lazy getter, the field kept is the one created
  last in the static initializer, else the field of the last getter; the last getter of that field is reported
  unless it is `synchronized` or holds a `synchronized` block outside lambdas.

Clone idiom (#2261, `tests/fixtures/spotbugs/clones`):

- CN_IDIOM: a class that lists `Cloneable` in `implements` itself, is neither abstract nor an enum, has no public
  `clone()` and holds no call of `clone()` anywhere in its declaration. At the class's first line.
- CN_IDIOM_NO_SUPER_CALL: a public instance `clone()` of a cloneable class that is public or protected, neither
  abstract nor final, that can return and does not call `super.clone()` itself. Priority 1 (the SARIF place
  then names the class too) when a class of the run extends the class, else 2.
- CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE: a public instance `clone()` of a class that is neither abstract nor
  cloneable, and that is no thrower; priority 1 when it calls `super.clone()`.
- CN_IDIOM is not reported either when the class has a covariant `clone()` of any access.

- A native public `clone()` counts as a `clone()` that does not call `super.clone()` and has no line: SpotBugs
  reports it without a region (line 0).

Review labs (`sing_lazy`, `sing_clone`, `sing_first`) and the line labs (#2459, `class_lines`) are exact.

On the six comparison code bases built here (Elasticsearch not built), SARIF results, same / missed / extra:
singletons 122 / 1 / 0, clone idiom 112 / 0 / 0. The missed one is SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR on
Nacos `AbstractProtocolNegotiatorBuilderSingleton`, an abstract class without a static field whose two
subclasses are singletons handed out as the abstract type; test classes of the same shape are not reported.
Real runs give both detectors to the engine (`MultipleInstantiationsOfSingletons` and `CloneIdiom` no longer
run in SpotBugs), except the singleton patterns on Lombok modules, whose generated constructors the engine does
not see.

Equals patterns (#2261, labs in `tests/fixtures/spotbugs/eq_*` and `bc_equals*`), all priority 2 and level `note`:

- EQ_DOESNT_OVERRIDE_EQUALS: a class (also an anonymous, local, nested or generic one) that is not abstract, not an
  enum, record or interface, declares an instance field that is not `transient` (final and volatile count; static
  fields, the hidden outer instance and captured variables do not), declares no `equals(Object)` and no public
  `equals(Self)`, and whose nearest superclass that declares `equals(Object)` (not `Object`) is not abstract and
  does not declare it `abstract` or `final`. An abstract class without `equals` on the way is skipped; a superclass
  the class path does not hold stops the search. A public class below a package-private one that declares a public
  `equals(Object)` gets a bridge from javac, which then is the class that declares it. Reported on line 1. The
  message and the SARIF arguments name the declaring class with its package, or without it when it is in the same
  package as the reported class (`Outer$Inner` kept); the place is always the full name, the file the reported
  class's.
- EQ_COMPARETO_USE_OBJECT_EQUALS: a concrete class that declares a non-static `int compareTo(Self)` or
  `int compareTo(Object)` (any access; `Comparable` is not needed), and neither it nor any superclass declares
  `equals(Object)`. `compareTo(Self)` wins over `compareTo(Object)`. A method that overrides a generic `compareTo(T)`
  of a supertype with another parameter type brings javac's bridge `compareTo(Object)`, reported at the first line of
  the class declaration (modifiers and annotations included, `tests/fixtures/spotbugs/eq_compareto3`). Otherwise
  the line is the first instruction of the method. Abstract classes are priority 3, which SpotBugs hides, and
  are not reported.
- BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS: a `public boolean equals(Object)` whose first cast of the argument
  (or of a local copy of it) to a type other than `Object` comes before any `instanceof` on it, `o.getClass()`,
  `isInstance(o)` or `super.equals(o)`, and lies in no `try` with a `catch` or `finally`, nor in a `synchronized`
  block. Lambdas and classes declared inside are separate methods. A `switch` on the argument with a type pattern
  counts as a cast. The line is that of the statement (the name of the variable for a declaration, the operator of
  an assignment).

Open differences, each measured with a lab: a cast that is only reached when an `int` field or variable equals a
non-zero constant (`x == 1 && ((C) o).x == 2`) is not reported by SpotBugs, the engine reports it. A cast in a
statement that spans lines, after an argument that javac boxes, gets the line of that argument
(`both(\n y,\n ((C) o).x)` is the second line), the engine gives the line of the statement. Casts in the branches of
a `?:` over several lines were not modelled.

On the six comparison code bases built here, SARIF results, same / missed / extra:
commons-lang 1 / 0 / 0, MyBatis 1 / 0 / 0, Guava 5 / 0 / 0, jackson-databind 9 / 0 / 0, javaparser-core 1 / 0 / 0,
Nacos 13 / 0 / 0 (Elasticsearch not built). The jackson-databind results are the seven BC findings, one
EQ_COMPARETO and one EQ_DOESNT. Real runs give the three patterns to the engine; `FindHEmismatch` and `DumbMethods`
still run in SpotBugs for their other patterns.

Serialization patterns (#2261, `src/java/spotbugs/serial/`, labs in `tests/fixtures/spotbugs/serial_*`). Both look at
a class that is `Serializable`, not `Externalizable`, not abstract, not an interface, enum or record:

- SE_NO_SERIALVERSIONID, priority 2, level `note`: a named class (not anonymous, not a `Throwable`) that declares a
  `transient` field (static ones count) and no `static final serialVersionUID` of a primitive type. Without a
  `transient` field SpotBugs gives priority 3, which it hides. Class first line, place the class.
- SE_BAD_FIELD: each instance field that is not `transient`, unless it is `final` and only ever given `null`. No line
  (the SARIF result has no region), place the field, arguments the class and the field name. Priority 1 is level
  `warning`, 2 `note`. The class *commits* to serialization when it lists `Serializable` itself, declares
  `readObject(x)`, `writeObject(x)` or `readResolve()` (any access, static too), or a `transient` field. The field
  holds the classes of its declared type: an array holds its elements; a `Collection` or `Map` holds its type
  arguments (wildcards hold nothing) and, when it is a class that cannot be serialized, itself. When every
  non-null value the class stores in the field has one type, the field holds that type instead (an anonymous class
  that is not serializable is a sure case; a cast array holds its erased element). Each held class is judged:
  - serializable, `Object`, `Iterable`, `CharSequence`, `Comparable`, `Cloneable`, a type variable: fine.
  - a class (not abstract) that cannot be serialized: sure, unless a known serializable class extends it, then
    likely.
  - an interface or abstract class: likely, unless a known serializable class is the first class below it (its
    superclass is the judged type itself or not below it), or a known serializable interface extends it; then fine.
  Known classes are the classes of the run and the classes their compiled form names: created, cast to, tested,
  caught, named by a class literal or in a method or field signature, or holding a called method or used static
  field; member classes of the classes whose code is loaded count as known subtypes of interfaces and abstract
  classes only. A local variable's declared type is not among them.
  Priority: sure is 1 when the class commits, else 2; likely is 2 when the class commits or declares a
  `serialVersionUID`, else 3. A `Throwable` adds one; a class with an outer instance (an inner class, or a local or anonymous class
  declared in instance code) adds one unless it commits.
  Priority 3 and above are hidden.

Open differences, each measured with a lab: SpotBugs also knows JDK classes that the code of loaded JDK classes
names (`Comparator.naturalOrder()`, or a run that loads `ObjectInputStream`, makes a serializable `Comparator` known,
turning a `Comparator` field from priority 2 into 3); the engine does not, so it reports such a field at priority 2.

On the six comparison code bases, SARIF results, same / missed / extra: commons-lang 0 / 0 / 0, MyBatis 4 / 0 / 0,
Guava 41 / 0 / 0, jackson-databind 42 / 0 / 0, javaparser-core 2 / 0 / 0, Nacos 82 / 0 / 0. `SerializableIdiom`
still runs in SpotBugs for its other patterns.

### Method patterns

HSM_HIDING_METHOD (#2263, `src/java/spotbugs/methods/hiding.rs`, labs in `tests/fixtures/spotbugs/hiding*`): a
static method that is not private hides a static, not private method of a superclass with the same name and the
same erased descriptor, return type included. Each superclass in the chain that declares one gives its own finding,
library classes too (`Thread.currentThread()`); a package-private method of a superclass in another package counts.
`main(String[])` is skipped (`main(int)` is not); static methods of interfaces and private methods are not hidden.
Priority 2, level `error`, line = the method's first line, arguments the signature with simple parameter types,
the simple binary name of the class (`N1`, `1L` for a local class, `1` for an anonymous one) and of the
superclass. The SARIF name drops the package only when the superclass is in the class's own package (`B.f()`, but
`p.T.currentThread()`). The engine writes the place as `function:p.B.f()@p.A` so nitpicker can tell. A class name
that starts with `$` keeps it (`$D`). SpotBugs reports nothing more for a class from the first `native` method that
hides one on, nothing for a class file with more than 1,000 methods (constructors, lambdas and the static
initializer count; the engine estimates this from the source), and nothing for a class whose superclass chain
cannot be resolved to `Object`. Every pattern of `FindHiddenMethod` is on the engine, so SpotBugs no longer runs
that detector, except for Lombok modules: the engine does not see the static methods Lombok writes (`builder()`).

On the six comparison code bases, SARIF results, same / missed / extra: jackson-databind 1 / 0 / 0, Guava
8 / 0 / 0, the others 0.

NN_NAKED_NOTIFY (#2263, `src/java/spotbugs/methods/notify/`, labs in `tests/fixtures/spotbugs/notify*` and
`lombok_notify`): SpotBugs reads the method's instructions in class-file order. A `synchronized` method, or any
`monitorenter`, starts a watch. While watching, instructions that read nothing keep it going: constants, stores to
locals and static fields, static calls, `new` with constant arguments, `iinc`, array creation, casts, non-capturing
lambdas, branches and returns. Reading a local, `this`, a static field or a field starts a read; a field read keeps
it going, and `notify()` or `notifyAll()` called with `invokevirtual` then is the call. Anything else during a read
ends the watch until the next `monitorenter`: `Object o = lock;`, `int y = count;`, a call on `this`, an `if` on a
parameter, `assert`. A notify call made without a read first (`"x".notify()`, `getLock().notify()`,
`R.class.notify()`) is not counted, and the watch goes on. After the call, one `return` or jump may follow, and the
end of the code reports it; in a block, a local load and `monitorexit` report it right away. Any other instruction
after the call ends the watch, as does a second call. `super.notify()` (`invokespecial`) and calls on a value of an
interface type (`invokeinterface`) do not count; on a type variable with several bounds javac calls `Object`'s
method with `invokevirtual`, whatever the erasure. There is one finding per method, at the first call reported, with
priority 2, level `warning`, the line of the call's `(`, and the method as the argument. Inner class creation reads
`this`, as does an anonymous class in an instance method; capturing lambdas and classes read what they capture,
also a local class that takes values only through the local class it extends (an anonymous subclass of it too),
and `Local::new` or `Inner::new` (the lambda javac writes takes them); only values declared outside the lambda or
class count. Local records, enums and interfaces are static and never take `this`. javac
writes the value of a constant (also a `final` instance field or a `final` local set from a constant), folds
`true ?`, `false &&` and `true ||`, turns `x += constant` on an `int` local into `iinc`, reads a static field named
through a value after dropping the value, and leaves out casts to a supertype, jumps to the next instruction and
the handlers of an empty `try` (its `finally` runs once). It copies `finally` blocks and instance initializers (into
each constructor that does not call `this(...)`). `int.class` reads `Integer.TYPE`. A `switch` on a primitive is
its selector and one instruction. Lombok's `@Synchronized` is a `synchronized` block on a
field. The engine writes the instructions from the source (`code.rs`, `values.rs`); code it does not follow
(`switch` on strings, enums and boxes, `try` with resources, `assert`, `yield`, unknown expressions) counts as a
read. Every pattern of
`FindNakedNotify` is on the engine, so SpotBugs no longer runs that detector.

Labs: 460 same / 0 missed / 0 extra (#2508 fixed the six differences; `tests/fixtures/spotbugs/notify_review_e`).
Code nested hundreds of levels deep takes time in step with its size. Known differences: a value whose type
javac infers as an intersection (`var c = m()` with `<X extends Object & I> X m()`), casts to an intersection type,
a class nested in an interface created with `new`, and a generic field or call whose substituted type makes javac
write a `checkcast`. On the six comparison code bases: Nacos 5 / 0 / 0, the others 0.

### Code idioms

Four whole detectors (#2263, `src/java/spotbugs/idioms/`), so SpotBugs no longer runs
ConfusionBetweenInheritedAndOuterMethod, IteratorIdioms, DefaultEncodingDetector and FindUselessControlFlow. All
findings have level `note`. `compiled` in `idioms/mod.rs` lists the methods javac writes for a class: field
initializers and initializer blocks go into each constructor that does not start with `this(...)` (or the one javac
writes), static ones and enum constant arguments into the static initializer, and each lambda is a method of its
own.

IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD (`outer.rs`, `outer_this.rs`, fixtures `ambiguous*`): a class
with an outer instance calls, on `this` (`m()`, `this.m()`, `In.this.m()`), an inherited instance method while a class
around it declares an instance method with the same name and descriptor, return type included (a private one too).
A method the class declares itself, a static or `super.` call, a method the outer class only inherits, or the very
method the outer class declares are not reported. SpotBugs looks only at classes that keep the outer instance in a
field: javac 18 and later leave `this$0` out unless the class is serializable or code outside its own constructors
uses the outer instance (an outer field or method, `Outer.this`, `new` of another inner class, also inside its
lambdas and the classes declared in it). Calls inside lambdas are not reported. One finding per method and inherited
method, at the `(` of its first call; arguments the inherited method (its declaring class, or the calling class when
an interface declares it, `java.lang.` dropped) and the calling method; priority 1 when that class is in another
package, else 2. The SARIF place is the outer method, named with its class (`B10.m()`).

IT_NO_SUCH_ELEMENT (`iterators.rs`, fixture `iterators`): a `next()` without parameters, not static, abstract or
native, in a class that is an `Iterator`, whose own code has no instance method call and no object creation (static
calls, string concatenation, array reads and `throw` of a value do not count; unboxing, a `for` over an `Iterable`, a
`switch` on anything but a primitive, `assert` and `try` with resources do). A class whose own `hasNext()` only
returns `true` is left alone (one inherited from a superclass is not). Line = the last instruction of `next()`.

DM_DEFAULT_ENCODING (`encoding.rs`, fixtures `encoding*`): the JDK constructors and methods SpotBugs lists for the
default charset, as measured (`new String(byte[])`, `getBytes()`, `InputStreamReader(InputStream)`, `FileReader`,
`FileWriter`, `PrintStream`, `PrintWriter`, `Scanner`, `Formatter` and `ByteArrayOutputStream.toString()`, see
`CONSTRUCTORS` and `METHODS`). Not `Scanner(Path)`, not commons-io, not method references. SpotBugs looks the
called method up again from the type it tracks for the receiver and names that type when the lookup still lands on
the JDK's own: what a local was given (its declared type where different values meet), what the class stores in a
field (one type only; stores of different types say nothing; a public field or one never stored keeps its declared
type), a cast's value when it fits the cast, nothing for a conditional of two types, and the class itself for
`this`, `super.m()` and `super(...)` (`new p.E$PS1(OutputStream)`; not when the class declares a constructor with
the same parameters). A class that overrides the method is not reported. A call that names a subclass counts only
in a class whose own code calls a listed JDK member directly (a nested class has its own code). One finding per
method and called method, priority 1, arguments the calling method and the called one; the SARIF place is the
called one, without the package when it is the class's own. Enum constant arguments belong to the static
initializer.

UCF_USELESS_CONTROL_FLOW and UCF_USELESS_CONTROL_FLOW_NEXT_LINE (`control/`, fixtures `control*`): an `if` whose
branches make no code (empty blocks and statements, declarations without a value, local classes, an `if` on a
constant that leaves nothing, a `break` or `continue` to where the code goes anyway), so its jump targets the next
instruction. Not when javac points the jump past a `goto` it writes next (the end of a `while` or of a `for` without
update, a `then` with an `else`, a `break` or `continue`, an arrow `case` before the last). SpotBugs takes the first
line after the jump, in code order, that is below the jump's line: NEXT_LINE (priority 1) when it is one line below,
UCF (priority 2) when two lines below, nothing otherwise. The line table (`control/lines.rs`) holds each statement,
each call at its `(`, loop tests and catch clauses, and what javac writes after a body: a `for` update, the jump back
of an enhanced `for` (at the header over an array, else at the body's closing brace), the exit of `synchronized` (its
closing brace) and of a `try` with catches or resources (the `try`'s last line), the inlined `finally`, its rethrow
(the `finally`'s closing brace) and the closing brace of a body that ends without `return`. The jump is on the last
line javac marks in the condition: the `if`, each call at its `(`, a protected field of a superclass in another
package read from a nested class (javac reads it through an accessor method). One finding per method and pattern.

SBSC_USE_STRINGBUFFER_CONCATENATION (StringConcatenation) is not ported: what it reports depends on how javac
compiles string concatenation for the target release (#2589).

On the six comparison code bases (commons-lang, guava, jackson-databind, javaparser-core, mybatis-3, Nacos), SARIF
results for the five patterns, same / missed / extra: 18 / 0 / 0 (guava 8, mybatis-3 5, javaparser-core 3, Nacos 2).

### Field patterns

Field patterns (#2262, `src/java/spotbugs/attributes/`, labs in `tests/fixtures/spotbugs/attr_*`). Each file notes
every load and store of the run's fields; the run decides once all files are read. SpotBugs meets a class's
constructors and static initializer before its other methods, those in the order javac writes them, and the
methods javac makes of lambdas last; field initializers and initializer blocks count from the first constructor
that does not start with `this(...)`. A load or store gets the line of the last call made before it in its
statement, else of the statement's start (a field initializer: the field's name; `this(...)`, an enum constant and
a `switch` written as a statement each start a statement of their own).

- PA_PUBLIC_PRIMITIVE_ATTRIBUTE, priority 2, level `note`: a public non-final field (any type, static too) of a
  top-level class that is not an enum, interface or annotation, stored into by a method of that class: a lambda
  counts; a constructor, the static initializer, a method named `init` or `initialize`, and nested, local or
  anonymous classes do not. The finding sits on the first load or store of the field SpotBugs meets in the whole
  run, in the classes' visiting order (see `order.rs`), in the file of the class that makes it.
- MS_SHOULD_BE_FINAL and MS_PKGPROTECT, level `note`: a public or protected static field of a class whose compiled
  form is public (a member class declared public or protected, or a member of an interface counts; interfaces
  themselves report other patterns). Without a load anywhere in the run the finding has priority 3, which SpotBugs
  hides. A final field is MS_PKGPROTECT (priority 2) when it is an array not known to be empty (`{}`, `new T[0]`).
  A field stored outside its class's static initializer is MS_PKGPROTECT (priority 2). Otherwise an array not
  known to be empty or a `Hashtable` is MS_FINAL_PKGPROTECT, a field the static initializer stores more than
  once is MS_SHOULD_BE_REFACTORED_TO_BE_FINAL, and the rest are MS_SHOULD_BE_FINAL: priority 1 for a non-array
  object, else 2. A load or store by a class of another package turns MS_PKGPROTECT into MS_MUTABLE_ARRAY or
  MS_CANNOT_BE_FINAL. The finding sits on the first load or store of the field in any class's static initializer
  (field initializers and enum constants included), in visiting order, or on no line.
- SS_SHOULD_BE_STATIC, priority 2, level `note`: a final instance field of a primitive type or `String` set to a
  compile-time constant, in any class (nested, local, anonymous and enums too), on the first line of the field's
  declaration, annotations included. The constant may use other such fields of the class (`final int e = a + 1;`).

On the six comparison code bases, SARIF results, same / missed / extra: commons-lang 5 / 0 / 0, MyBatis 1 / 0 / 0,
Guava 0 / 0 / 0, jackson-databind 5 / 1 / 1, javaparser-core 13 / 0 / 0, Nacos 39 / 0 / 0. The jackson-databind
difference is the line of `PotentialCreators.propertiesBased`: SpotBugs visits `PotentialCreators` before
`POJOPropertiesCollector`, the visiting order model puts both off and visits them the other way round.
A `@SuppressFBWarnings` on a method also covers these patterns for the fields of its class and of the classes
nested in it; #2493 lists the suppression cases the engine does not match yet.
`FindPublicAttributes`, `MutableStaticFields` and `UnreadFields` still run in SpotBugs for their other patterns.

### Boolean reference comparisons

RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN (#2262, `src/java/spotbugs/compare/`, labs in
`tests/fixtures/spotbugs/ref_boolean*`), priority 2, level `note`: `==` or `!=` between two `Boolean` objects, or a
`Boolean` and an object of one of its supertypes. Types are those of the compiled code: a local holds the type of
what was stored in it (its declared type where stored values meet with different types), a downcast gives its
type, an upcast keeps the value's, a call gives its erased return type, a parameter typed with a type variable is
never a `Boolean`. The message names the method around (the lambda's own method in a lambda, each constructor for
an instance initializer).

SpotBugs numbers values in each method and notes the compared ones, the right one first: the first-declared local
holding the value (parameters first; a local copied from another, through a cast or a pattern too, holds the same
value), else the field it was read from (a captured local of an anonymous or local class is its `val$` field), else
the method that returned it. A field read twice from the same object is one value until that field is stored or a
monitor is entered; calls do not end it. `Boolean.valueOf(x)` that javac writes for boxing notes what `x` is (a
local as named, a field), else the call. A final field declared `Boolean` (`Boolean.TRUE`, `val$x`) is the only
value noted, the left one when both sides are such fields. A value known to be null (`null`, a final field set to
`null`) is never reported. The SARIF place is the last local noted, named in the last method noted (else the method
around); else the last field, in the class around, shown with the class that declares it; else the last method;
else the method around. Comparisons of one method with the same notes are one finding, on the first one's line.

The line is javac's: the last line mark before the comparison's branch. That is the statement's start, a local's
name, a loop condition's `(`, a lambda body's start, each call after its arguments, and the test and each branch of
a conditional whose value is kept (none for one that is itself a condition). Some comparisons leave no branch in the
class file and are not reported:
- Both outcomes jump to the same code: `if (a == b) {}`, `while (a == b) break;`, both branches breaking out of one
  loop, `a == b && false`, or a last `break` of a switch. Statements javac emits nothing for count as empty: nested
  empty blocks, `int x;`, a local class, `if (false) {…}`.
- The comparison is code javac drops after a condition it knows: `if (DEBUG) {…}`, `DEBUG && a == b`,
  `true || a == b`.
- It sits in the update of a `for` loop whose body never reaches it.

A `continue` in a `while`, a `for` without an update or a for-each, an `else` after a branch that falls back to
such a loop, and a comparison in a `finally` block still give two places. An initializer in an enum constant's body
is named after that body's constructor (`new p.E$1(String, int)`), and a record's component read in its methods is
its final field.

On the six comparison code bases, SARIF results, same / missed / extra: commons-lang 1 / 0 / 0, jackson-databind
15 / 0 / 0, the other four 0 / 0 / 0. Differences left on hand-written edge cases (final fields where values meet,
the line of a merged finding, `var` loop variables, pattern switch guards) are in #2599. `FindRefComparison` still runs in SpotBugs for its other patterns.

### Thread patterns

Thread patterns (#2522, `src/java/spotbugs/threads/` and `src/java/spotbugs/concurrent/`, labs in
`tests/fixtures/spotbugs/atomicity*` and `unsync_get`).

- SharedVariableAtomicityDetector (AT_STALE_THREAD_WRITE_OF_PRIMITIVE, AT_NONATOMIC_64BIT_PRIMITIVE,
  AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE), priority 2, level `warning`, place: the field. It looks at one class
  at a time, and only at a class that uses threads: a `synchronized` method or block, a `Runnable` subtype, a
  `volatile` field, a field of a `java.util.concurrent.atomic` type or of a `Lock` subtype, a local or parameter of
  an atomic type, a call to a method of a `Lock`, or a call to `Collections.synchronized*`. Only methods count
  (constructors, initializers, lambdas and nested classes never do). Code is locked inside a `synchronized` method
  or block, where a `lock()` or `lockInterruptibly()` on the same object is held on every path, and in a private
  method that every call in the class's methods makes from locked code (calls from constructors and lambdas count as
  locked; a private method nothing calls is locked). A write of a non-final primitive field of the class itself,
  outside locked code, on `this` (or a local set once to `this`) or on the first parameter of a static method, or of
  a static field, is reported when another method reads the field outside locked code. The write is
  AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE when the value written was computed from the field by arithmetic in
  javac's instruction order (`order.rs`), else, unless the field is `volatile`, AT_NONATOMIC_64BIT_PRIMITIVE for a
  `long` or `double` and AT_STALE_THREAD_WRITE_OF_PRIMITIVE for the rest. One finding per method, field and pattern,
  on the line of the first such write (the line of the last call or `?:` condition in the value, else of the
  statement).
- AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION, priority 2, level `warning`, place: the method
  `ConcurrentHashMap.put(Object, Object)`: a `put` on a value whose type is `ConcurrentHashMap` itself (not
  `super.put` or an inherited `put`) inside the branch that runs when `get(key) == null` or `!containsKey(key)`,
  directly or through a local holding the result, alone or in an `&&` chain, as the condition of an `if`, `while`,
  `for` or `?:`. One finding per `put`, on the line of its `(`.
- UG_SYNC_SET_UNSYNC_GET, priority 2, level `warning`, place: the setter: a non-static, non-private method `getX`
  with a body that is not `synchronized`, in a class with a `synchronized` non-static `setX` (same suffix, any
  parameters), on the getter's first line.

On the seven comparison code bases, SARIF results, same / missed / extra: MyBatis 22 / 0 / 0, Guava 16 / 0 / 0,
Nacos 70 / 0 / 0, jackson-databind 4 / 0 / 0, commons-lang 0 / 0 / 0, javaparser-core 0 / 0 / 0, Elasticsearch
server 2 / 0 / 0 on the classes javac could compile for SpotBugs. FindInconsistentSync2 and the other lock
detectors of #2522 still run in SpotBugs.

### Naming, unread fields, random and initialization

Parts of #2263 batch 2, so these patterns leave SpotBugs while their detectors still run there for patterns that
stay silent on test code. Labs in `tests/fixtures/spotbugs/naming*`, `unread*`, `random*` and `init*`.

Naming (`src/java/spotbugs/naming/`): NM_METHOD_NAMING_CONVENTION and NM_FIELD_NAMING_CONVENTION report a name
whose first letter is upper case, second lower case and that has no `_`. Final fields, methods of interfaces,
methods named like their class and methods that override a concrete superclass method are left out. Public and
protected members of a class whose class file is public are priority 2; members of other classes and of enums are
priority 3, except when a part of the package name is a single character. A method sits on its first line of code
(a record's implicit accessor on the `record` line), a field on no line. NM_CLASS_NOT_EXCEPTION: a class whose
binary name ends in `Exception` and that does not extend `java.lang.Exception`, again unless a package part is a
single character. NM_SAME_SIMPLE_NAME_AS_SUPERCLASS (priority 1) and NM_SAME_SIMPLE_NAME_AS_INTERFACE (priority 2):
the name without the package equals that of the direct superclass or of a directly implemented interface.

URF_UNREAD_FIELD and URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD (`attributes/unread.rs`): an instance field that is not
final, that the run stores into and never loads (`this.f = this.f` is no load, nor a load in code javac drops behind
a condition it knows, nor a pattern variable named like the field). Classes that are serializable (but for a field
named `serialVersionUID`) or declare a native method are skipped, and so are fields whose name starts with `_`. With
Lombok, a field that a getter, `toString`, `equals` or `hashCode` Lombok writes reads counts as loaded. A field of a class whose `Class`
object the run names (a class literal, `Class.forName` with a constant name, an `assert` in the outermost class) is
priority 3. The finding sits on the first store SpotBugs meets: classes in visiting order, then the methods in the
order javac writes them (lambdas last).

DMI_RANDOM_USED_ONLY_ONCE (`sequence/`): after `new Random(...)` or `new SecureRandom(...)` in a compiled method,
each later call that javac writes against one of those two classes is reported once per called method, until the
method runs another constructor or a `super.` call. A constructor runs `super(...)` first, then field initializers,
then its own code; a `for` loop's updates run after its body. Methods of `Object` and `ints`, `longs`, `doubles` do not
count.
Priority 1, on the call's arguments line, SARIF place the called method.

IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION (`sequence/initialization.rs`): the static initializer of a type
reads or writes a static field, or calls a static method, through the name of a strict subtype. A read is priority 1
when the subtype's class file is public, else 2; a write or call is one more. One finding per subtype, with the best
priority, on its first line.

### Ignored results, reboxing and caught exceptions

Four patterns of #2262, labs in `tests/fixtures/spotbugs/return_values*`, `no_side_effect*`, `reboxed*` and
`catch_exception*`, all level `note`.

RV_RETURN_VALUE_IGNORED_BAD_PRACTICE and RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT (`src/java/spotbugs/returns/`): a
call or `new` whose result is dropped (a call statement, the body of a lambda that returns nothing, a `for`
initializer or update, the value written before a static field or method, but not an arm of a `switch`
expression). One finding per method, called method and priority, on the first call's line. A constructor is named
as javac writes it: an inner class takes its outer instance first, a local class the captured variables last, an
anonymous class `new A$1(A, …)`. The bad-practice pattern takes the JDK
methods SpotBugs checks (`File.delete()`, `Queue.offer(…)`, `ExecutorService.submit(…)`, …), from a table measured
on every public method of the server-side JDK modules (`jdk-returns.tsv`), on a receiver that is not an interface
of the run. The no-side-effect pattern takes the JDK methods of that table and the methods of the run without side
effects. Priority 1 when the result has the type of the method around, else 2; one more when a `try` with a
`catch` or a `finally`, a `catch` of a `try` with a `finally`, a `synchronized` block or a Lombok `@Synchronized`
method covers code all on the call's line, and a finding at priority 3 is not reported. Rules measured on SpotBugs:
- A method of the run has no side effect when its body stores only into its locals (a constructor also into the
  fields of its own class, a static initializer into its own static fields), throws nothing, has no `assert` and
  no `synchronized` block, allocates nothing with an effect, and calls only methods without one. A call on an
  object needs every override with code below the called method to have none, overrides through a bridge method
  (`String get(String)` over `T get(T)`) included. A record's canonical constructor and an anonymous class's
  constructor are judged too; one created on an outer instance (`outer.new In() {}`) has an effect.
- A stub has an effect: a public or protected method of a public class (or a method of an interface), neither
  static nor final, that overrides no superclass method, returns only `-1`, `0` or `1`, `null`, `false`, `this`
  or a parameter, and is the only code of the run for each interface method it implements. A call that can run
  only a stub has an effect.
- A call of an abstract method with a `throws` clause, and of a method that implements a JDK interface method,
  has an effect.
- A reported call of a static method or a constructor also needs the static initializers of its class and of its
  superclasses to have no effect (static fields, interface constants, enum constants and their constructors; a
  class with an `assert` has one); this is not asked of the calls inside the bodies judged.
- `void` methods, `equals(Object)`, methods marked `@CanIgnoreReturnValue` (or in a class so marked) are not
  reported, nor overrides of a JDK method the bad-practice pattern takes (SpotBugs reports those at priority 3).
- A JDK method a class inherits from a JDK superclass is known only when the code of the run names that
  superclass (a call, field, `new`, cast, `instanceof`, class literal, `catch`, `throws` or supertype).
- The SARIF place of a JDK method drops a `java.lang.` prefix before the method name (`reflect.Field.getName()`);
  the message keeps the full name.

BX_UNBOXING_IMMEDIATELY_REBOXED (`src/java/spotbugs/returns/boxes.rs`): a boxed value unboxed and boxed again into
the same box type, at a store, an argument, a return or a conditional. A conditional is a box only when both
branches are that box, else the (wider) primitive; a cast to the box type counts as boxing.

REC_CATCH_EXCEPTION (`src/java/spotbugs/catches/`): a `catch (Exception e)` of a `try` whose code throws no
checked exception that `Exception` stands for. The exceptions are those declared by the calls and constructors of
the `try` (a call on an interface-typed receiver adds none), the `close()` of each resource that is not of an
interface type, and `Throwable` for a try-with-resources. A `try` that also catches `RuntimeException` is skipped,
and so is one that can throw `Exception` itself or that throws nothing and makes no call. Each range of the
exception table that covers the `try` is judged alone: a range ends at a `return` or at a `break` or `continue`
that leaves the `try`, and its size in bytes is worked out from the source as javac 21 writes it
(`catches/size.rs`, `code.rs`, `resources.rs`, `slots.rs`). Priority is 4, plus 1 when the handler reads the
exception and 1 when the `try` has another `catch`, minus 1 when the range throws two or more exception types,
minus 1 at 30 bytes and minus 1 more at 300 bytes; one finding per method and priority, on the `catch` line, at
priority 1 or 2.

On the six comparison code bases, SARIF results, same / missed / extra: MyBatis 4 / 0 / 0, Nacos 23 / 0 / 0,
Guava 5 / 0 / 0, jackson-databind 6 / 0 / 0, commons-lang and javaparser-core 0 / 0 / 0. Known differences, all on
labs (`no_side_effect` and the lab notes):
- Effects on objects created in the method itself (`new StringBuilder().append(…)`, a local array or list) are
  taken as effects; SpotBugs takes some as none.
- JDK methods missing from the table count as effects. The rows of `Object`, `String`, `StringBuilder`,
  `StringBuffer` and `Boolean` were measured again with the same method.
- A local class declared in a constructor of another local class, and some anonymous classes in it, can be named
  without the instance around them.
- Methods of the classpath are not judged; a call of one has an effect.
- The table is for JDK 21; another JDK can differ.
- Byte sizes leave out `ldc_w` for big constant pools, the outer-instance hop of an inner class reading a field
  of its outer class, the captured values of a lambda, the copies javac makes of a nested `finally`, and the
  slots of earlier `case` groups; `switch` and `assert` count as large. A size next to 30 or 300 bytes can be
  judged wrong.
The SpotBugs detectors behind these patterns still run in SpotBugs for their other patterns.

## Names the compiler makes up

SpotBugs reads class files, so a finding inside a lambda or an anonymous class names a method that is not in
the source: `p.A.lambda$run$3(String, int)`, `new p.A$2(A, List)`. `src/java/javac/` works these names out from
source, as `javac` 21 makes them (#2138; the open differences are in #2140). The rules were learned from the
class files `javac` writes for `tests/fixtures/javac`; `tests/expected/javac.json` holds what `javap` shows for
them, and `parity/javac/run.sh` writes it again. `--rules _JavacNames` lists the names of a source list, and
`parity/javac/compare.py report.json <classes dir> [-v]` compares them with compiled classes.

- Anonymous and local classes (`Outer$1`, `Outer$1Local`) are numbered per enclosing class and simple name, in
  the order the compiler works through the code: members in source order, and inside a call the receiver, then
  the plain arguments, then the arguments whose meaning depends on the chosen method (a lambda, a parenthesized
  or conditional expression, a `switch` expression, a call without written type arguments, a `new` with `<>`).
  An anonymous class gets its own number between the two groups of its arguments, or after both with `<>`.
- A lambda becomes `lambda$<place>$<n>`: `n` counts per class in source order, an inner lambda before the one
  around it; the place is the method, `new` for constructors, initializer blocks and instance fields, `static`
  for static initializers and fields, and the class name for a field of a local class (empty for an anonymous
  one: `lambda$$0`). A serializable lambda carries a hash of its signature instead and takes no number; only
  its class is listed.
- A method reference takes a number like a lambda when the compiler turns it into one: `super::m`,
  `Outer.super::m`, `int[]::new`, `array::clone`, the constructor of a local or inner class, a varargs method
  that is not handed one array, a protected method of a class in another package, and a target that is an
  intersection of types.
- A lambda's hidden method takes the local variables it uses from around it, in order of first use, then its
  own parameters. Variables with a constant value are not taken. A pattern variable counts where it is in
  scope: inside the statement or `case` of its pattern, or after an `if` or `while` that tests the negated
  pattern; flow rules beyond that are not rebuilt.
- An anonymous class constructor takes the enclosing instance (unless the code is static), the instance written
  before `.new` if there is one, the parameters of the superclass constructor it calls, and the local variables
  the class uses. A local class constructor takes the enclosing instance, its written parameters and the
  variables it uses. A class that extends a local class takes that class's variables first, last one first.

Measured against the class files of the seven code bases (same / missed / extra, by kind, line, name and
parameter types). Listing the names takes 11.1 s wall, 35.7 s CPU and 0.6 GB for Elasticsearch `server`:

| Code base | Anonymous classes | Local classes | Lambdas | Method references | Serializable lambdas |
| --- | --- | --- | --- | --- | --- |
| Elasticsearch `server` | 1,867 / 0 / 0 | 18 / 0 / 0 | 7,501 / 94 / 89 | 248 / 0 / 1 | 0 |
| Nacos | 475 / 0 / 0 | 0 | 704 / 3 / 3 | 2 / 0 / 0 | 0 |
| javaparser-core | 34 / 0 / 0 | 1 / 0 / 0 | 920 / 0 / 0 | 1 / 0 / 0 | 0 |
| Guava | 383 / 0 / 0 | 25 / 0 / 0 | 242 / 0 / 0 | 1 / 0 / 0 | 0 |
| jackson-databind | 27 / 0 / 0 | 0 | 3 / 0 / 0 | 0 | 0 |
| commons-lang | 17 / 0 / 0 | 0 | 286 / 0 / 0 | 11 / 0 / 0 | 36 / 0 / 0 |
| MyBatis | 10 / 0 / 0 | 0 | 72 / 0 / 0 | 1 / 0 / 0 | 0 |

12,885 names are the same. The 97 that differ:

- A parameter type the engine cannot work out, 83 lambdas: the name and number are right and a type is listed
  as `?`, as `Object` or as a wider type. Most are implicitly typed lambda parameters whose type comes from a
  generic method.
- A method reference on a value whose type is two types at once (`Stream.concat` of streams of two classes
  that share a superclass and an interface), 14 in one file: the compiler turns such a reference into a
  lambda, the engine does not see the second type, and the lambdas after it get a number that is too low.

All 29 SpotBugs findings inside lambdas on the seven code bases name a method the engine produces.

Not rebuilt, found on test code only: two implicitly typed lambdas handed to a generic method can be numbered
in the opposite order when the type of the first depends on the second; an anonymous class written with `<>`
whose argument holds another anonymous class skips a number; a lambda parameter typed with an anonymous class.
