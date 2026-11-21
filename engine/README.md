# nitpicker-engine (prototype)

A Rust program that runs nitpicker's Java rules without a JVM: tree-sitter parses the sources, a type index
reads class files, and an XPath 3.1 evaluator runs the PMD XPath rules of the Java rulesets unchanged. The
goal is the same findings as PMD in a fraction of the time. nitpicker does not call it yet, and it is not part
of the npm package.

## Layout

- `src/engine/`: language-neutral part (file walk, parallel run, findings, token duplicates).
- `src/java/`: Java checks on the syntax tree (a set of Checkstyle checks, facts, metrics).
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

`tests/rules/all.json` holds the 342 XPath rules a Java run sends to PMD (name, message, query, properties):
the 241 XPath rules of the Java rulesets and the 101 built-in PMD XPath rules those rulesets switch on, with
their property overrides. `parity/rules-from-rulesets.py <rulesets dir> <pmd-java jar> <out.json>` writes it
and prints the built-in rules PMD implements in Java, which the engine does not run.

Other switches: `NP_XPATH_ONLY=<rule,rule>` runs some rules, `NP_XPATH_STATS=<file>` writes time
and findings per rule, `NP_SLOW=<ms>` prints the files slower than that, `NP_DBG=1` prints each type question
the resolver gave up on.

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
two lambdas unfinished and `RetryInTest` then matches them (#2125). The PMD-shaped trees of all 5,106 files have
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

- nitpicker does not start the engine; `tests/rules/all.json` is generated but checked in.
- The 77 rules PMD implements in Java (#2031), Error Prone and SpotBugs are untouched.
- A type question that needs more than 20,000 resolution steps is answered "unknown" (29 on Elasticsearch).

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
| `public-contracts` | The public contract usage check of `coding-standards`. It asks the compiler only about member reads named like a contract method; `--all-reads` asks about every read. |
| `unused-api` | The unused option and unused prop check. nitpicker decides which files the program has and what role each plays and passes that with `--input`; the engine returns the targets, their members and the references it found, and nitpicker turns them into findings. |
| `design` | The facts of the design signals check: the project's types with their fields, and its callables with their parameters, calls, reads and decisions (`src/typescript/typed/design/`). nitpicker names the files that count with `--input`, marks what is published and evaluates the rules. |

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
below. The rest is planned in #2097.

`tests/expected/spotbugs.json` holds what SpotBugs reported for the compiled `tests/fixtures/spotbugs`; each
fixture folder is one experiment on SpotBugs' behaviour. `parity/spotbugs/run.sh` runs SpotBugs the way a Java
run does, `rows.py` turns its XML report into rows and `compare.py report.json spotbugs.xml <patterns>
[sources.txt] [-v]` compares by pattern, file, line and message.

Measured on 4 cores (findings: same / missed / extra, exposed representation then constructor throw). SpotBugs
runs all its patterns and needs compiled classes first (31 s for Elasticsearch `server`); the engine column is
these five patterns from source:

| Code base | Files, lines | SpotBugs wall, CPU, peak | Engine | Exposed representation | Constructor throw |
| --- | --- | --- | --- | --- | --- |
| Elasticsearch `server` | 5,106, 1,035k | 249 s, 417 s, 3.2 GB | 8.0 s, 28.9 s, 0.5 GB | 4,330 / 5 / 1 | 1,532 / 7 / 1 |
| Nacos | 3,118, 548k | 108 s, 242 s, 2.9 GB | 5.2 s, 13.0 s, 0.3 GB | 2,438 / 2 / 4 | 85 / 0 / 0 |
| javaparser-core | 594, 121k | 48.3 s, 97.2 s, 2.3 GB | 0.9 s, 3.0 s, 0.1 GB | 500 / 0 / 0 | 17 / 0 / 0 |
| Guava | 610, 183k | 43.6 s, 99.8 s, 1.8 GB | 1.3 s, 4.3 s, 0.1 GB | 14 / 0 / 0 | 0 / 0 / 0 |
| jackson-databind | 478, 134k | 35.7 s, 78.2 s, 1.7 GB | 0.9 s, 3.3 s, 0.1 GB | 224 / 0 / 0 | 17 / 0 / 0 |
| commons-lang | 264, 106k | 19.9 s, 50.5 s, 1.2 GB | 0.7 s, 2.2 s, 0.1 GB | 15 / 0 / 0 | 17 / 0 / 0 |
| MyBatis | 393, 40k | 15.5 s, 50.3 s, 0.9 GB | 0.4 s, 1.2 s, 0.1 GB | 173 / 0 / 0 | 32 / 0 / 0 |

Exposed representation, 12 differences (7,694 same):

- A value stored from a class in another file, 1: the engine judges a field by the stores in its own file;
  SpotBugs also counts stores from classes it visited earlier, wherever they are.
- A field that only ever takes a parameter, read back from another object and stored, 1 constructor missed.
- A field of the superclass returned through a field typed with that superclass, 1 missed.
- 9 not explained yet (tracked in #2098): 4 getters of one protobuf-generated builder and 1 other getter the
  engine reports alone; 2 getters of a protobuf-generated message and 2 other getters only SpotBugs reports.
  Small classes of the same shape do not reproduce them, so the cause is in their surroundings.

Constructor throw, 8 differences (1,700 same):

- Anonymous classes, 6 missed: a field initializer or initializer block of an anonymous class that can throw is
  not looked at yet.
- A local class, 2 (1 finding): the engine names it differently in the message.

What SpotBugs counts as "an exception can leave the constructor", as measured (`tests/fixtures/spotbugs/ctor_*`):
a `throw` or `assert` the handler around it does not take; a call to a method that declares exceptions; a call
to a method of the same class from which one of those can leave, however deep; `this(...)` to a constructor with
one of those, one level deep. Not counted: calls to constructors, to undeclared methods of other classes, anything
before the first constructor call of the body (which a `new` among the arguments of `super(...)` already ends),
and a rethrown `Throwable`. Final classes, enums, records and classes with a final `finalize()` are exempt.

Only the innermost handler around a place is asked, as the compiled exception table lists it
(`ctor_finally`, `ctor_nested`, `ctor_order`, `ctor_helpers*`): the `catch` clauses of the nearest `try`, and an
outer `try` never. A `try` with a `finally` block and no `catch`, a `catch` block of a `try` with `finally`, and
a `synchronized` block let everything through. The body of a `try` with resources lets nothing through, and
the `close()` the compiler adds after it counts as a call under the `catch` clauses of that `try`. In a
constructor one matching `catch` clause is enough; for a call in a method every `catch` clause of the `try`
has to take the exception.

How a field counts as holding only unchangeable values (`loads*`, `visits`, `values`):

- Every store in the field's own class counts. A store from another class counts only when SpotBugs visits that
  class first, and it visits classes in the order of a Java `HashMap` keyed by the class name with slashes,
  sized for the number of classes in the run. The engine takes the classes of the run as that number.
- A call result stored from another class counts against the field only when the called method's class is part
  of the run and was visited before the storing class.
- A value read from another field is fine when that field was given an unchangeable value at least once. The
  field read back into itself (`this.f = other.f`) says nothing, and counts against the field when it went
  through a local variable first.
- A local variable with two values is judged the way `c ? first : second` is.

Also measured: the accessor of a record's varargs component is reported and its constructor is not; a pattern
variable of `instanceof` holds the tested value; one parameter stored twice in a field of one method is one
finding; the outer-instance field of an inner class is `this$N`, N counting the inner classes around the outer
one; the line of an inner-class constructor is the line of its opening brace.

Known gaps in what is rebuilt: `c ? a : b` stored in a field follows a table measured on SpotBugs, which decides
by the compiled form (`tests/fixtures/spotbugs/choices*`); a local variable with more than two values is taken
as changeable, and so is a value more than 8 local variables or 256 nested values deep; stores from other files are not seen; a branch SpotBugs finds dead because it compares a field
nothing writes with a constant is still looked at; a call that is the very first instruction of a `finally`
block is still covered by the handler before it in the compiled form, which the engine does not rebuild.
