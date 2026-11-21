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

