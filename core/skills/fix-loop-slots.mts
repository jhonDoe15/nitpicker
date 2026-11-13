export type FixLoopSlots = {
  readonly preset: string;
  readonly hasFix: boolean;
  readonly hasQuick: boolean;
  readonly fixers: string;
  readonly tests: string;
  readonly formatStep?: string;
  readonly runDetail: string;
  readonly exit1?: string;
  readonly exit2Cause: string;
  readonly suppress: string;
  readonly exceptionNote?: string;
  readonly tail: readonly string[];
};

const NODE_TYPES =
  'The gate type-checks for you. Node globals (`process`, `AbortSignal`) and `node:` imports need ' +
  '`@types/node` in devDependencies.';

const NODE_SUPPRESS =
  'no `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, coverage or mutation ignore comments ' +
  '(`istanbul`/`c8`/`v8 ignore`, `Stryker disable`), config `exclude`/`disable`/`exceptions`, legacy ' +
  'entries, generator markers (`@generated`, `DO NOT EDIT`) in files you wrote, or weakened tests.';

const NODE_RUN_DETAIL =
  'It applies ESLint and Prettier fixes with its own configs (do not format with plain `prettier`; ' +
  "its quotes, semicolons, indentation and width follow most of the project's files), then checks " +
  'your change against the merge base.';

const JVM_BUILD_TOOLS =
  "with the project's `./gradlew` or `./mvnw` when there is one, otherwise `gradle` or `mvn` from the " +
  'PATH (`NITPICKER_GRADLE` or `NITPICKER_MAVEN` overrides both)';

const JVM_TESTS = "Run the project's tests (`./gradlew test`, or `./mvnw test` on Maven).";

const SHARED_TAIL = [
  'With Spring on the classpath, also follow [spring.md](spring.md).',
  'If your change edits a {unit}, class, file or package that existed before it, read ' +
    '[editing-existing-code.md](editing-existing-code.md) before you edit.',
  'Before you change code other modules use, or fix a bug, read [beyond-the-gate.md](beyond-the-gate.md).',
] as const;

function jvmTail(unit: string): readonly string[] {
  return SHARED_TAIL.map((paragraph) => paragraph.replace('{unit}', unit));
}

const NODE_EXCEPTION_NOTE = 'A TypeScript compiler error has no entry; fix the type.';

export const SLOTS: readonly FixLoopSlots[] = [
  {
    preset: 'typescript',
    hasFix: true,
    hasQuick: true,
    fixers: 'ESLint and Prettier',
    tests:
      "Run your tests with the project's runner (its `test` script). Failing tests stop coverage, " +
      `CRAP and mutation from running. ${NODE_TYPES}`,
    runDetail: NODE_RUN_DETAIL,
    exit2Cause: 'usually a missing package',
    suppress: NODE_SUPPRESS.replace('`@ts-nocheck`, ', ''),
    exceptionNote: NODE_EXCEPTION_NOTE,
    tail: [],
  },
  {
    preset: 'javascript',
    hasFix: true,
    hasQuick: true,
    fixers: 'ESLint and Prettier',
    tests:
      "Run your tests with the project's runner (its `test` script). Failing tests stop coverage, " +
      `CRAP and mutation from running. ${NODE_TYPES}`,
    runDetail: NODE_RUN_DETAIL,
    exit2Cause: 'usually a missing package',
    suppress: NODE_SUPPRESS,
    exceptionNote: NODE_EXCEPTION_NOTE,
    tail: [],
  },
  {
    preset: 'python',
    hasFix: true,
    hasQuick: true,
    fixers: '`ruff check --fix` and ruff format or black',
    tests:
      "Run the project's tests with its own runner (pytest, unittest, `manage.py test` or nose2). " +
      'Failing tests are a tool error that names them; coverage and CRAP then come only from the ' +
      'tests that pass, and mutation testing leaves the failing modules out.',
    runDetail:
      'It first applies `ruff check --fix` and the formatter named in the "Format with ..." line ' +
      "(with the project's formatter config only when `tools.<formatter>.precedence` in " +
      '`nitpicker.config.json` lists `"project"`, as the gate does) to the changed files and lists ' +
      'the rewritten ones under "Fixed files:".',
    exit2Cause: 'usually a tool missing from the environment',
    suppress:
      'no `# noqa`, `# type: ignore`, `# pragma: no mutate`, `do_not_mutate`, config ' +
      '`exclude`/`disable`/`exceptions`, legacy entries, or weakened tests (`-x`, `-k`, `--deselect` ' +
      'and reruns in `addopts` are ignored anyway).',
    tail: [],
  },
  {
    preset: 'java',
    hasFix: true,
    hasQuick: true,
    fixers: 'google-java-format or palantir-java-format',
    tests:
      `${JVM_TESTS} Failing tests make the gate exit 1, and so does a change that does not compile: ` +
      'each compile error is a `build/compile-error` finding at its line, and the other checks wait ' +
      'until it builds.',
    runDetail:
      'It first rewrites the changed Java files with the formatter the run names under "Following ' +
      'this project\'s conventions" (google-java-format 1.35.0, `--aosp` for the aosp style, or ' +
      'palantir-java-format) and lists them under "Fixed files:". When the run says no Java ' +
      'formatter runs, it leaves the files alone; keep the layout by hand. Then it runs the build on ' +
      `the merge base and on head, ${JVM_BUILD_TOOLS}.`,
    exit2Cause: 'the build, or a base that does not compile',
    suppress:
      'no `// NOPMD`, `@SuppressWarnings`, `@SuppressFBWarnings`, `CHECKSTYLE` comments, coverage or ' +
      'mutation markers (`@Generated`, `@ExcludeFromJacocoGeneratedReport`, `@DoNotMutate`), config ' +
      '`exclude`/`disable`/`exceptions`, legacy entries, or weakened tests. The one exception is ' +
      '`@SuppressWarnings("PMD.SpringDataNativeQuery")` on a repository method with native SQL ' +
      '([spring.md](spring.md)).',
    tail: jvmTail('method'),
  },
  {
    preset: 'kotlin',
    hasFix: true,
    hasQuick: true,
    fixers: 'ktlint or ktfmt',
    tests: `${JVM_TESTS} Failing tests stop coverage, CRAP and mutation from running.`,
    runDetail:
      'It first rewrites the changed Kotlin and Java files with the formatter named at the start of ' +
      'the run (ktlint or ktfmt, google-java-format for Java) and lists them under "Fixed files:". ' +
      'When a "Fix notes:" line says no formatter was found, keep the layout by hand. Then it runs ' +
      `the project's build (Gradle, or Maven with \`kotlin-maven-plugin\`) on the merge base and on ` +
      `head, ${JVM_BUILD_TOOLS}.`,
    exit1:
      'A compile error is a `build/compile-error` finding at its line; fix it first, since the ' +
      'other checks wait until the code builds.',
    exit2Cause: 'usually a Gradle or Maven error',
    suppress:
      'no `@Suppress` of a detekt or ktlint rule, coverage or mutation markers (`@Generated`, ' +
      '`@ExcludeFromJacocoGeneratedReport`, `@DoNotMutate`), config `exclude`/`disable`/`exceptions`, ' +
      'legacy entries, or weakened tests. In Java files the Java rules apply: `@SuppressFBWarnings` ' +
      'and `@SuppressWarnings("PMD")` are findings, and a project\'s own PMD or Checkstyle config is ' +
      'used only when `nitpicker.config.json` opts in under `tools`.',
    tail: jvmTail('function'),
  },
  {
    preset: 'go',
    hasFix: false,
    hasQuick: false,
    fixers: 'none',
    tests:
      "Run the project's tests: `go test ./...` (with the build tags the project's " +
      '`nitpicker.config.json` lists under `go.buildTags`, as `-tags=...`). Failing tests are a tool ' +
      'error that names them.',
    formatStep:
      'Format every new file, and every file you touched that was formatted before your change ' +
      '(`gofmt -l <file>` on the base lists it if not), with the formatter printed in the finding ' +
      '(gofmt, gofumpt or goimports: the gate uses the one the project already uses, so never ' +
      'switch it). With no other signal it is `gofmt -w`.',
    runDetail:
      'It runs `go vet`, `go test` and its own checks on the merge base and on head with the Go ' +
      'toolchain on the `PATH`.',
    exit2Cause: 'usually a module that does not load, or Go missing from the `PATH`',
    suppress:
      'no `//nolint`, `//lint:ignore`, build tags that hide a file from the checks, config ' +
      '`exclude`/`exceptions`, legacy entries, or weakened tests (`t.Skip` added to get past a failure).',
    tail: [
      'Before you change code other packages use, or fix a bug, read [beyond-the-gate.md](beyond-the-gate.md). ' +
        'Why each rule is here: [SOURCES.md](SOURCES.md).',
      "The linters' allowed forms (errors, names and doc comments, simplifications, modern forms): " +
        "read [rules/linters.md](rules/linters.md) before you write Go. nitpicker's own rules (panics, " +
        'logged and swallowed errors, goroutine owners, root contexts, sleeps, package state, ' +
        'interfaces, `any`, names, HTTP timeouts, I/O in loops, repeated strings, task markers, method ' +
        'aliases, secrets, test honesty): read [rules/own-rules.md](rules/own-rules.md).',
    ],
  },
];
