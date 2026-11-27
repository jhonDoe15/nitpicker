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
switch it off again. A source set compiled with a module path keeps NullAway on Error Prone, because a module
can carry `@NullMarked` too and the engine does not read that. A class file's nullness comes from its
declaration annotations and from its type annotations (JSpecify's `@Nullable` is written that way): a mark on
the type itself makes a field, a result or a parameter nullable, one on a variable arity parameter's elements
lets each argument be null, and one on its array lets the array be null. A parameter list printed in a message
shows the type annotations the way javac prints them.

- The other ported checks stay with Error Prone: it ends their messages with a `Did you mean ...?` sentence
  made from its suggested fix, which the engine does not write yet.
- A source set stays with Error Prone as a whole when an annotation processor runs in its compile (Lombok and
  generated sources change what the compiler sees), when the project passes Error Prone options other than
  check levels, when the engine cannot read one of its files, or when the engine fails.
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
for a field the field under the class of the method that reads it, and the name and method. A
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
field javac reads last, and SARIF names a lock field under the class of the method that reads it
(`tests/expected/spotbugs-arguments.json`). `tests/expected/spotbugs-places.json` holds the places
SpotBugs' SARIF gives for the fixtures, and the SARIF results of real runs match SpotBugs' on all seven code bases.

Not done: `REC_CATCH_EXCEPTION` needs the checked exceptions each `try` block can throw and the rule for its
priority (most findings are low priority and hidden at `-medium`); it is left for a later batch (#2262).

### Lombok

SpotBugs skips the members Lombok writes, because Lombok marks them with `@lombok.Generated` (unless a
`lombok.config` sets `lombok.addLombokGeneratedAnnotation = false`). The engine reads source and does not see
them either, so only what Lombok changes in hand-written code matters (`tests/fixtures/spotbugs/lombok`):

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
interface type (`invokeinterface`) do not count. There is one finding per method, at the first call reported, with
priority 2, level `warning`, the line of the call's `(`, and the method as the argument. Inner class creation reads
`this`, as does an anonymous class in an instance method; capturing lambdas and classes read what they capture. javac
writes the value of a constant (also a `final` instance field or a `final` local set from a constant), folds
`true ?`, `false &&` and `true ||`, turns `x += constant` on an `int` local into `iinc`, reads a static field named
through a value after dropping the value, and leaves out casts to a supertype, jumps to the next instruction and
the handlers of an empty `try` (its `finally` runs once). It copies `finally` blocks and instance initializers (into
each constructor that does not call `this(...)`). `int.class` reads `Integer.TYPE`. A `switch` on a primitive is
its selector and one instruction. Lombok's `@Synchronized` is a `synchronized` block on a
field. The engine writes the instructions from the source (`code.rs`, `values.rs`); code it does not follow
(`switch` on strings, enums and boxes, `try` with resources, `assert`, `yield`, unknown expressions) counts as a
read. Known differences (#2508): type variables with an intersection bound, and local classes that take captured
values only through a superclass or a constructor reference. Every pattern of
`FindNakedNotify` is on the engine, so SpotBugs no longer runs that detector.

Labs: 572 same / 4 missed / 2 extra (all #2508). On the six comparison code bases: Nacos 5 / 0 / 0, the others 0.

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
nested in it; #2507 lists the suppression cases the engine does not match yet.
`FindPublicAttributes`, `MutableStaticFields` and `UnreadFields` still run in SpotBugs for their other patterns.

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
