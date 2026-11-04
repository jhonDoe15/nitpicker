# Infer evaluation: concurrency, starvation and scope leakage

Status: evaluated, decision recorded. **Not integrated.** The prebuilt release links a GPL-3.0-or-later
library into its Java analyzer, the Java checks it adds are narrow, and its finding identity is too
coarse to use as it is. The rule ideas worth owning are listed at the end, each with the issue that
tracks it or the shipped rule that already covers it.

This page answers the question asked by [mindset.md](mindset.md): does the tool add enough over
the tools already shipped to justify a dependency, and can it be a dependency at all. It is
written for the Java preset ([java-preset.md](java-preset.md)) and the Kotlin preset
([kotlin-preset.md](kotlin-preset.md)); Kotlin is covered in [Kotlin](#kotlin).

## What was run

| Item          | Value                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Release       | Infer v1.3.0, `infer-linux-x86_64-v1.3.0.tar.xz` from the project's GitHub releases             |
| Size          | 276 MB archive, 1.2 GB unpacked (940 MB of that is the bundled Clang for C and Objective-C)     |
| Newest tag    | v1.3.0 was the newest release found at the time of the evaluation                               |
| JDK           | OpenJDK 21.0.12; Gradle 8.14.3; Maven 3.9.11                                                    |
| Checkers      | RacerD (`--racerd-only`), Starvation (`--starvation`), Scope Leakage (`--scope-leakage`)        |
| Output        | `--sarif` plus the default `infer-out/report.json`                                              |
| Fixtures      | 17 small Java classes in a scratch project, run through `javac`, Gradle and Maven (see below)   |
| Larger sample | Apache Commons Lang 3.17.0 main sources (249 files, 97,613 lines) in a Gradle and a Maven build |

The run command for a build is:

```sh
infer run --racerd-only --starvation --scope-leakage --scope-leakage-config '<json>' --sarif -- <build command>
```

Scope Leakage has no useful default: it needs a JSON configuration naming the scope annotation, the
scope classes and the "must not hold" pairs, and it is passed on the command line or in `.inferconfig`.

## Licenses

| Component                                  | License                                        | Evidence                                                           |
| ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| Infer (core, checkers, `infer-annotation`) | MIT                                            | repository `LICENSE`, `opam/infer.opam.locked`, the annotation POM |
| Sawja 1.5.12 (Java bytecode analysis)      | **GPL-3.0-or-later**                           | opam-repository metadata; pinned by `opam/infer.opam.locked`       |
| Javalib 3.2.2 (class file reader)          | LGPL-2.1-only with the OCaml linking exception | opam-repository metadata; pinned by `opam/infer.opam.locked`       |
| Bundled Clang/LLVM 21                      | Apache-2.0 with LLVM exceptions                | `LICENSE.TXT` inside the bundled headers                           |

Both Java libraries are inside the single 247 MB `infer` executable of the release: it contains
`camlSawja_pack` and `camlJavalib_pack` symbols (23,840 symbol strings mention Sawja alone). The
release archive ships no license or notice file for them; the only license text in it belongs to
LLVM. The README of the project says the same in one line: enabling Java support may require
components licensed under the GPL. The repository offers `--disable-java-analyzers`, but a build
without them has nothing to offer a Java or Kotlin project.

What this means for a dependency decision, which is a judgment and not legal advice:

- The prebuilt Java-capable binary is a combined work that includes GPL-3.0-or-later code, and the
  archive does not carry the corresponding notices.
- [mindset.md](mindset.md) requires permissive dependencies. The LGPL tools already shipped
  (Checkstyle, SpotBugs) are weak-copyleft libraries that nitpicker runs as separate processes;
  GPL-3.0-or-later in the analyzer itself is a different category and is not covered by that
  precedent.
- Building a permissively licensed Infer is not possible, because the Java frontend depends on Sawja.

The license finding alone blocks adoption as a dependency. The rest of this page records what
the tool would have added, so that the decision can be revisited if the licensing changes.

## Java build capture

Both build tools work with `infer run -- <build command>`. Every capture below ran after `clean`.

| Build  | Command that was run                                      | What Infer does (observed in `infer-out/logs`)                                  |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Gradle | `infer run ... -- gradle --no-daemon clean compileJava`   | runs `gradle --debug ...` and reads the `javac` arguments from the debug log    |
| Maven  | `infer run ... -- mvn -B clean compile`                   | runs `mvn ... -P infer-capture`; the compiler's `javac` call goes through Infer |
| javac  | `infer run ... -- javac -cp <annotations jar> -d out ...` | wraps the compiler call                                                         |

All three produced the same 7 reports for the fixtures.

- Only compile tasks that actually run are captured. Running `infer run -- gradle --no-daemon compileJava`
  on an up-to-date build printed "Nothing to compile. Try cleaning the build first.", analyzed nothing,
  reported "No issues found" and exited 0. A gate would have to clean first, or force the task to rerun,
  or it would pass silently. `compileTestJava` or `test-compile` has to be on the command line for test
  code to be analyzed.
- Gradle capture reads the debug log of one build invocation. The Java preset already drives Gradle
  through an init script and a fresh report directory; the capture would be a second Gradle build next
  to it, not part of it.
- Maven capture appends `-P infer-capture` to the command line and worked on a project with the default
  `maven-compiler-plugin` configuration; other compiler setups (a different compiler id, an in-process
  compiler) were not tried.

## Fixture results

Annotations used: `com.facebook.infer.annotation.ThreadSafe` (from the `infer-annotation` artifact,
MIT), and project-local `@UiThread` and `@ScopeType(Class)` annotations (Infer matches the UI thread
annotation by simple name).

| Fixture               | Shape                                                                      | Reported                                                              |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RacyCounter`         | `@ThreadSafe`, `count++` and a read with no lock                           | 2 `THREAD_SAFETY_VIOLATION` (unprotected write, read/write race)      |
| `SafeCounter`         | `@ThreadSafe`, both methods `synchronized`                                 | none                                                                  |
| `PlainCounter`        | no annotation, no lock anywhere                                            | none (RacerD is not triggered: no annotation and no `synchronized`)   |
| `HalfLockedCounter`   | no annotation; one method locks a private lock, the other reads without it | 1 `THREAD_SAFETY_VIOLATION` (the `synchronized` block is the trigger) |
| `LockOrderInversion`  | `first` then `second` in one method, `second` then `first` in another      | 1 `DEADLOCK` naming both methods                                      |
| `LockOrderConsistent` | the same order in both methods                                             | none                                                                  |
| `UiBlocking`          | `@UiThread` class calling `Future.get()` and `Thread.sleep(500)`           | 2 `STARVATION`                                                        |
| `BackgroundBlocking`  | the same `Future.get()` without the annotation                             | none                                                                  |
| `OuterHoldsInner`     | `@ScopeType(Outer)` class with a field of an `@ScopeType(Inner)` class     | 1 `SCOPE_LEAKAGE` (configured pair Outer must not hold Inner)         |
| `InnerHoldsOuter`     | the reverse direction, which the configuration allows                      | none                                                                  |
| `OuterHoldsPlain`     | scoped class holding an unscoped `StringBuilder`                           | none                                                                  |

Every report depends on an explicit assumption: a thread-safety annotation or a `synchronized` use
for RacerD, a UI-thread annotation for Starvation (the checker is written for Android, and the
blocking-call model lists I/O, binder calls and `Future.get`), and a scope configuration for Scope
Leakage. None of it is annotation-free race detection, and none of it should be described that way.
The unannotated, unlocked `PlainCounter` is racy by the same reasoning and is not reported.

On the larger sample (Commons Lang, 249 files) RacerD reported 3 `THREAD_SAFETY_VIOLATION`, all in
`MultiBackgroundInitializer`: unsynchronized reads of a `HashMap` that `addInitializer` writes under
`synchronized`. The same three reports came out of all five builds (3 Gradle, 2 Maven); they are
plausible, and the only ones in 97,613 lines.

## Cost

Small fixture (18 source files):

| Build  | Plain `clean` + compile | `infer run` of the same build |
| ------ | ----------------------- | ----------------------------- |
| Gradle | 17.2 s (31.5 s cold)    | 21.6 s                        |
| Maven  | 14.2 s                  | 27.1 s                        |

Commons Lang main sources (249 files, 97,613 lines). Wall-clock time varied widely between runs on the
shared test machine, so only CPU time is comparable:

| Build  | Infer CPU time (user + sys), 2 runs | Wall time with Infer, 2 runs | Wall time without Infer, 2 runs |
| ------ | ----------------------------------- | ---------------------------- | ------------------------------- |
| Gradle | 55.4 s and 53.2 s                   | 326 s and 272 s              | 201 s and 169 s                 |
| Maven  | 59.4 s and 52.1 s                   | 226 s and 149 s              | 68 s and 81 s                   |

A plain `mvn compile` of the same sources used 27 s of CPU, so Infer roughly doubles the compile
cost of a project of this size. It also needs a second build because the capture cannot share the
compilation the Java preset already runs. The release is 276 MB to download and 1.2 GB on disk, of
which only the 247 MB executable matters to a Java project.

## Output and identity

- Formats: `report.json` (a list of issues with `bug_type`, `severity`, `file`, `line`,
  `procedure`, `qualifier`, `key`, `hash`, `bug_trace`) and `report.sarif` (SARIF 2.1.0, `ruleId`,
  `level`, `codeFlows`, and `fingerprints` with `hash/v1` and `key`). Both parse without a custom
  reader.
- Line independence: adding 5 lines above two reported methods moved their lines (10 and 14 became
  19 and 23) and left every `hash` and `key` unchanged.
- Collisions: `key` is `<file base name>|<method name>|<bug type>`. Two classes named `Box` in
  packages `a` and `b` produced identical `key` and `hash` values for `set()` and for `set(int)`
  respectively. Overloads of one class differ in `hash` but not in `key`. A usable identity has to
  be built from the full file path, the qualified procedure with its parameter types and the issue
  type, which the JSON provides, so this is a mapping task and not a blocker by itself.
- The SARIF `uri` is `file:<path relative to the working directory>` with an absolute path in
  `uriBaseId`, and regions carry a start line and column only.
- Reproducibility: the version is the archive tag; findings were identical across repeated runs of
  the same build.

## Overlap with the shipped tools

The same fixtures were run through the Java preset (`nitpicker --all`, Error Prone 2.50.0 with the
reviewed checks, SpotBugs 4.9.3 at medium confidence, PMD errorprone and bestpractices). Its
enforceable findings on them were `UnnecessarilyFullyQualified`, `PreferJavaTimeOverload` (on the
`Thread.sleep(500)`), `AvoidStringBufferField` and `EI_EXPOSE_REP`. None of the 7 Infer reports has
a counterpart: no data race, no lock-order inversion, no blocking call under a UI annotation and no
scope violation was reported by Error Prone, SpotBugs or PMD. The run predates the preset's PMD
`multithreading` category; with it the fixtures that use `synchronized` are also rejected, because the
preset allows one locking style (a private final `ReentrantLock`), which is a style rule and not a race
or lock-order report.

What the shipped tools do cover in this area: Error Prone `GuardedBy`, `SynchronizeOnNonFinalField`,
`NonAtomicVolatileUpdate`, `DoubleCheckedLocking`, `StaticGuardedByInstance`,
`UnsynchronizedOverridesSynchronized`, `WaitNotInLoop`, `LockNotBeforeTry`, `ThreadLocalUsage`,
`Immutable`, PMD's multithreading category, and the Spring bean-lifetime rules `spring-scope-capture`
and `spring-request-state` ([Spring architecture rules](java-preset.md#spring-architecture-rules)).
They are lexical, annotation-driven (`GuardedBy` needs the annotation on the field) or modeled on
Spring's bean scopes, and do not follow calls between methods.

## Decision

Infer is not integrated, for four reasons that each hold on their own.

1. **License.** The Java analyzer of the release contains GPL-3.0-or-later code (Sawja) and the
   archive carries no notice for it. [mindset.md](mindset.md) requires permissive dependencies.
2. **Narrow, assumption-driven value.** What it adds over the shipped tools is lock-order
   inversion and races between methods of a class that is annotated or already uses `synchronized`.
   Starvation is Android-oriented, and Scope Leakage needs a configuration that is only
   as good as the project's own scope annotations, which a Spring project does not have.
3. **Cost.** A second build, about twice the compile CPU time, a 1.2 GB tool, and capture that
   depends on the Gradle debug log and the `javac` call of the Maven compiler plugin.
4. **Identity.** The upstream `key` collides across packages, so adoption would need a new identity
   derived from the JSON.

If the license changes, the integration route would be the JSON report, mapped to nitpicker findings
with an identity built from the file path, qualified procedure and issue type, and a pinned release.

## Rule ideas worth owning

All are small checks on the Java and Kotlin parsers nitpicker already has, none needs whole-program
analysis, and all need explicit modeled recognition with banned and allowed fixtures.

| Idea                                                                                        | Tracked by                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote I/O or blocking calls while holding a lock or transaction                            | [#317](https://github.com/jhonDoe15/nitpicker/issues/317)                                                                                                                    |
| Blocking calls in async or reactive contexts                                                | [#315](https://github.com/jhonDoe15/nitpicker/issues/315), runtime companion in [blockhound-evaluation.md](blockhound-evaluation.md)                                         |
| Shorter-lived dependencies captured by singletons, request data kept in singletons          | Done: `spring-scope-capture` ([#324](https://github.com/jhonDoe15/nitpicker/issues/324)), `spring-request-state` ([#325](https://github.com/jhonDoe15/nitpicker/issues/325)) |
| Enabling PMD's multithreading category                                                      | Done: the Java preset runs it ([#220](https://github.com/jhonDoe15/nitpicker/issues/220))                                                                                    |
| Lock-order inversion between two `synchronized` blocks of one class (same-class, same-file) | [#553](https://github.com/jhonDoe15/nitpicker/issues/553)                                                                                                                    |
| Plain mutable instance field written without a lock in a class that also locks elsewhere    | [#554](https://github.com/jhonDoe15/nitpicker/issues/554) (SpotBugs `IS2_INCONSISTENT_SYNC` is the nearest shipped detector and did not report `HalfLockedCounter`)          |

None of the 7 fixture reports had a counterpart among the shipped tools (see
[Overlap with the shipped tools](#overlap-with-the-shipped-tools)). Of those reports, the last two
rows are the ones that need no annotation and no scope configuration, and both can be recognized in
one class without call graphs, so each has its own issue. The others depend on a `@ThreadSafe` or
UI-thread annotation or on a scope configuration that projects rarely carry; their useful parts are
the rows above.

## Kotlin

Infer's Kotlin support is a capture of `kotlinc` invocations (`--force-integration kotlinc`,
`--kotlin-capture`), not of a Gradle or Maven Kotlin build, and no `kotlinc` was available in this
evaluation, so no Kotlin path was run. The license finding is the same for the Kotlin preset. The
Gradle build capture described above sees only `javac`, so a Kotlin module would not be analyzed by it.

## Reproducing

The fixtures were a scratch project and are not committed. To recreate them, write the classes of
[Fixture results](#fixture-results) in package `demo`, with the project-local `UiThread` and
`ScopeType` annotations and the `Outer` and `Inner` scope classes they use, in a plain Java project
whose only dependency is `com.facebook.infer.annotation:infer-annotation` (Gradle `java` plugin, or a
Maven `jar` project with the default compiler plugin). The larger sample is the released Commons Lang
3.17.0 source archive with its main sources in the same two builds. Then, with the build of your
choice after `--`:

```sh
tar -xJf infer-linux-x86_64-v1.3.0.tar.xz -C <empty directory>
export PATH=<empty directory>/infer-linux-x86_64-v1.3.0/bin:$PATH
infer run --racerd-only --starvation --scope-leakage \
  --scope-leakage-config '{"annot-classname":"demo.ScopeType","scopes":[{"classname":"demo.Outer","generators":[]},{"classname":"demo.Inner","generators":[]}],"must-not-hold":[{"holds":"demo.Outer","held":"demo.Inner"}]}' \
  --sarif -- gradle --no-daemon clean compileJava
```
