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
NP_XPATH_RULES=tests/rules/review.json JAVA_HOME=<jdk 21> target/release/nitpicker-engine <source dir> \
  --rules _XPath --classpath <file with one jar or class folder per line, absolute paths> --out report.json
```

`tests/rules/review.json` is a snapshot of the 130 XPath rules of the Java rulesets (name, message, query,
properties). Other switches: `NP_XPATH_ONLY=<rule,rule>` runs some rules, `NP_XPATH_STATS=<file>` writes time
and findings per rule, `NP_SLOW=<ms>` prints the files slower than that, `NP_DBG=1` prints each type question
the resolver gave up on.

## Same findings as PMD

`cargo test --release` runs the fixtures in `tests/fixtures` and compares file, rule, line and column with
`tests/expected`, which PMD 7.16.0 produced:

```
PMD_CLASSPATH=<class path of the PMD 7 command line> \
  python3 parity/pmd-expected.py tests/rules/review.json tests/fixtures/formats tests/expected/formats.json
```

For a real project, write PMD's rows once and compare an engine report with them:

```
python3 parity/pmd-expected.py tests/rules/review.json <source dir> pmd-rows.json <class path file>
python3 parity/compare.py report.json pmd-rows.json <source dir> [rule]
```

Measured with all 130 rules on 4 cores (findings: same / missed / extra):

| Code base | Files, lines | PMD 7.16.0 wall, CPU, peak | Engine | Findings |
| --- | --- | --- | --- | --- |
| commons-lang, javaparser, guava, jackson-databind, mybatis-3 | 2,321 files | 67 s, 250 s, 1.5-2.0 GB | 14.6 s, 50 s, 0.3-0.5 GB | 5,118 / 0 / 0 |
| Nacos, all modules | 5,410, 844k | 77 s, 297 s, 2.4 GB | 17 s, 64 s, 0.4 GB | 3,709 / 0 / 0 |
| Elasticsearch `server` | 5,117, 1.04M | 85 s, 328 s, 2.8 GB | 24 s, 89 s, 0.5 GB | 2,497 / 0 / 0 |

On the whole Elasticsearch tree (18,155 files, 3.3M lines) the engine takes 75 s, 264 CPU-s and 1.7 GB. PMD
takes about 190 s, 750 CPU-s and 4.6 GB there and stops reporting after a StackOverflowError in its type
inference, so findings on that tree are compared part by part.

Four more libraries and the `review-rules` fixture of the Java adapters agree as well (7,557 findings in all
for the libraries and fixtures, none missed, none extra).

## Memory

The type index is built from outlines: each file with the bodies of methods, constructors and initializers
blanked (kept when a class is declared inside). The outlines are dropped before the rules run, and each file is
parsed again for its rules and dropped when they are done, so the peak does not grow with the full trees of the
whole project. Class files are listed at start and read on first use.

## PMD behaviour the engine copies

- A query that fails at run time on a file gives no findings for that rule and file. The report lists it as
  rule `!<name>`.
- `// NOPMD` on the first line of a finding and `@SuppressWarnings` with `"PMD"`, `"PMD.<Rule>"` or `"all"` on
  any enclosing declaration hide the finding. Block comments and other spellings do not.
- In XPath regular expressions `\w` does not match `_`, and `\s` is space, tab, line feed and carriage return.
- A `let` value is worked out on first use when it can be several items and does not read the context item,
  or when the variable is read at most once outside a loop; otherwise at the declaration. A query that fails in
  PMD on a value it never uses therefore fails here too.
- `matchesSig` compares the parameter types after type arguments are filled in; a single-type import names a
  class even when its jar is missing; columns count UTF-16 units.

## Not done yet

- nitpicker does not start the engine; rule lists are a snapshot, not generated from the ruleset XML.
- Rules PMD implements in Java, Error Prone and SpotBugs are untouched.
- A type question that needs more than 20,000 resolution steps is answered "unknown" (29 on Elasticsearch).

## TypeScript checks that need types

The engine has no TypeScript type system. A check that needs types walks the engine's own tree and asks the
TypeScript compiler's API server (`tsc --api`, TypeScript 7 and later) over a pipe: symbols, types, signatures
and type text, by node, alone or in batches (`src/typescript/types/`). A node of the engine's tree is named to
the compiler by its kind and extent, looked up in the compiler's node table of the file; offsets are converted
from bytes to the UTF-16 units the compiler counts.

```
nitpicker-engine typescript-public-contracts --compiler <tsc of TypeScript 7> --project <tsconfig.json> [--only-named]
nitpicker-engine typescript-type-replay --compiler <tsc> --project <tsconfig.json> --questions <jsonl> --kinds <json>
```

`typescript-public-contracts` is the public contract usage check of `coding-standards`. `--only-named` asks the
compiler only about member reads named like a contract method. `typescript-type-replay` asks the compiler the
questions `parity/typescript-type-questions.mts` recorded from the plugin rules and counts matching answers;
`--kinds` is the compiler's `SyntaxKind` table as JSON (name to number).

Measured on Grafana, 4 cores (wall, CPU, peak memory of the process tree; findings identical in every row):

| Project | Node check | Node, only named reads | Engine | Engine, `--only-named` |
| --- | --- | --- | --- | --- |
| Root application, 6,364 production files, 61 findings | 65.0 s, 86 s, 4.4 GB | 43.2 s, 61 s, 3.7 GB | 26.9 s, 44 s, 4.3 GB | 14.5 s, 29 s, 3.4 GB |
| `grafana-ui`, 1,185 production files, 58 findings | 10.2 s, 19 s, 1.0 GB | 6.9 s, 13 s, 0.9 GB | 4.0 s, 8 s, 0.9 GB | 1.8 s, 4 s, 0.7 GB |
| The 15 packages with a tsconfig, 216 findings | 53.3 s, 101 s | | | 10.8 s, 30 s |

Nearly all of the engine's time is the compiler computing types, on one thread; a question costs about 10
microseconds on the pipe once its type is known. Types the server computed for diagnostics are not reused for
questions.

The 42 type-aware plugin rules ask 134,885 distinct questions about nodes on `grafana-ui`. The native compiler
gives the same answer as the JavaScript compiler for 132,720 (98.4%); 2,058 differ only in the order of union
members or properties in the type text, or in the escaping of names that start with two underscores; 107
(0.08%) differ in substance (index-signature symbols, the declaration node of a property assigned onto a
function, standard library versions).
