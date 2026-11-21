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
has to take the exception.

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

### Null patterns

`src/java/spotbugs/nulls/` follows values through a method on the flow graph of `src/java/flow/`: a backward
pass finds where a value is dereferenced whichever way the flow goes, a forward pass carries what is known about
each local variable and field. Measured on Elasticsearch `server` (4 cores), where SpotBugs reports 647 findings
of the three patterns (87% of its 746 null findings):

| Pattern | Same | Missed | Extra |
| --- | --- | --- | --- |
| `NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE` | 485 | 61 | 11 |
| `NP_NULL_ON_SOME_PATH` | 92 | 9 | 11 |
| `NP_ALWAYS_NULL` | 0 | 0 | 0 |

With the three patterns the run takes 18.0 s, 67 CPU s and 0.58 GB at its peak on that code base, 8.0 s and
30 CPU s more than the other five patterns alone; SpotBugs with all its patterns takes 249 s, 417 CPU s and
3.2 GB after a 31 s compile. The callee summaries are worked out once per class, not once per file, and whether
a method is overridden is looked up over every class of the run: both are still to be made cheaper.

What SpotBugs does, as measured (`tests/fixtures/spotbugs/null_*`, 229 findings, all the same):

- Only `@CheckForNull`, or an annotation whose own declaration carries `@CheckForNull` (a nickname, as measured
  with `@TypeQualifierNickname` beside it), marks a method result or a field. `javax.annotation.Nullable` and
  other annotations named `Nullable` that are not such nicknames do nothing. The
  mark is inherited from an overridden method, and a record component hands it to its accessor and field.
- A value that only may be null is reported where it is dereferenced, as long as it is dereferenced whichever
  way the flow goes from where it arose. `return` and `throw` are ways without a dereference; an exception
  thrown by a call is not a way. A value that is certainly null (from `null`, or on the null side of a test)
  stays reportable past a split.
- A dereference is a call on the value, a field or array access, unboxing, `synchronized`, `throw`, the iterable
  of a `for`, a `switch` on it, and handing it to a method of the same file that dereferences that parameter on
  every way through (static, private, final or not overridden; followed through further calls).
- What is known of a field of `this` ends at a call on `this` (also `super.` and `this(...)`), a call or
  constructor handed `this` and a `synchronized` block;
  the field then counts as read again at that point. A `volatile` field is read anew each time.
- The test of an `assert` is run, and past any `assert` a value that only may be null is no longer reported.
- Lambda bodies are never reported; anonymous classes, constructors, initializers and field initializers are.
- Several results of one method dereferenced on one line make one finding.

Differences on Elasticsearch `server`, 92:

- Handed to a method that dereferences it, about 68 missed: the method is in another file or in the JDK. A
  rule sees the other files of a run only as outlines without bodies, so this needs a pass over the whole
  project that records which parameters each method dereferences; SpotBugs has such a list for the JDK built in.
- A value arising after several null tests in a row, 6 extra: SpotBugs drops it (a field then gets
  `NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE`). The experiments show three tests in a row are enough, and that
  calls, other branches, loops and tests of method results in between each weaken it by a different amount; no
  rule tried so far fits both the experiments and this code base, so none is built in.
- A method of the same file that dereferences its parameter, 3 extra: SpotBugs did not use that knowledge,
  probably because of the order it visits classes in.
- A helper that always throws, 2 extra: SpotBugs knows the call does not return.
- `switch` with `case null`, 1 extra.
- Not looked at one by one yet: 9 extra and 2 missed of `NP_NULL_ON_SOME_PATH`, 1 line that differs.

Not rebuilt yet: `NP_NULL_PARAM_DEREF` and its variants, `NP_GUARANTEED_DEREF`,
`NP_NULL_ON_SOME_PATH_EXCEPTION`, `NP_NULL_ON_SOME_PATH_MIGHT_BE_INFEASIBLE`, `NP_LOAD_OF_KNOWN_NULL_VALUE`, the
`RCN_` family, `NP_PARAMETER_MUST_BE_NONNULL_BUT_MARKED_AS_NULLABLE`, `NP_BOOLEAN_RETURN_NULL` and
`NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`. Other code bases are not compared yet.


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
