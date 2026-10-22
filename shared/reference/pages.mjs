export const PAGES = [
  {
    id: 'checks',
    title: 'Nitpicker checks',
    summary:
      'The checks nitpicker runs itself in every preset: function and file size, CRAP, coverage, mutation, duplicates, coupling, dead code, test runtime, repository hygiene and the policy checks on nitpicker.config.json.',
    guide: 'spec/checks.md',
  },
  {
    id: 'typescript-nitpicker',
    title: 'TypeScript and JavaScript: nitpicker ESLint rules',
    summary:
      "The ESLint rules nitpicker's own plugin adds to the TypeScript and JavaScript presets (`nitpicker/*`).",
    guide: 'docs/typescript-strict-preset.md',
  },
  {
    id: 'typescript-eslint',
    title: 'TypeScript and JavaScript: ESLint core and typescript-eslint rules',
    summary:
      'The rules of ESLint itself and of typescript-eslint that the TypeScript and JavaScript presets turn on, including the restricted syntax, properties and globals.',
    guide: 'docs/typescript-strict-preset.md',
  },
  {
    id: 'typescript-plugins',
    title: 'TypeScript and JavaScript: ESLint plugin rules',
    summary:
      'The rules of the third-party ESLint plugins the presets use: Vitest, React, accessibility, Testing Library, i18n, regular expressions and functional style.',
    guide: 'docs/typescript-strict-preset.md',
  },
  {
    id: 'typescript-static',
    title: 'TypeScript and JavaScript: static checks',
    summary:
      'Prettier, the TypeScript compiler, the dependency-cruiser architecture rules, the entry-point check and the coding-standards checks.',
    guide: 'docs/typescript-strict-preset.md',
  },
  {
    id: 'java-pmd',
    title: 'Java and Kotlin: PMD rules',
    summary:
      "PMD's errorprone and bestpractices categories and the rules nitpicker adds to them, for Java sources in the Java and Kotlin presets, with Gradle and Maven.",
    guide: 'docs/java-preset.md',
  },
  {
    id: 'java-checkstyle',
    title: 'Java and Kotlin: Checkstyle rules',
    summary:
      "The checks of Checkstyle's Google style that the Java and Kotlin presets run on Java sources, with Gradle and Maven.",
    guide: 'docs/java-preset.md#slice-3-checkstyle',
  },
  {
    id: 'java-spotbugs',
    title: 'Java and Kotlin: SpotBugs rules',
    summary:
      'The SpotBugs bug patterns, with find-sec-bugs, that the Java and Kotlin presets run on compiled classes, with Gradle and Maven.',
    guide: 'docs/java-preset.md',
  },
  {
    id: 'java-errorprone',
    title: 'Java and Kotlin: Error Prone and NullAway checks',
    summary:
      'The Error Prone checks and NullAway that the Java and Kotlin presets compile Java sources with, with Gradle and Maven.',
    guide: 'docs/java-preset.md#error-prone-and-nullaway',
  },
  {
    id: 'java-nitpicker',
    title: 'Java and Kotlin: nitpicker rules',
    summary:
      'The rules nitpicker adds on top of the JVM tools: ArchUnit architecture rules, Spring configuration findings, the formatter check and the suppression scan, in Java and Kotlin projects.',
    guide: 'docs/java-preset.md',
  },
  {
    id: 'kotlin-detekt',
    title: 'Kotlin: detekt rules',
    summary:
      "detekt's default rules and the one-way rules nitpicker pins on top of them (`detekt.<ruleset>.<Rule>`).",
    guide: 'docs/kotlin-preset.md#one-way-rules',
  },
  {
    id: 'kotlin-nitpicker',
    title: 'Kotlin: nitpicker source checks',
    summary:
      'The Kotlin source checks, the compiler warnings and the ktlint and ktfmt format checks of the Kotlin preset.',
    guide: 'docs/kotlin-preset.md#source-checks',
  },
  {
    id: 'python-ruff',
    title: 'Python: ruff rules',
    summary: "The ruff rules in nitpicker's own ruff config, by rule code.",
    guide: 'docs/python-preset.md',
  },
  {
    id: 'python-nitpicker',
    title: 'Python: nitpicker rules',
    summary:
      "The Python rules nitpicker's own script checks (`python-rules/*`), the coupling and import-cycle findings, the ruff format check and the finding for a run in which no tests ran.",
    guide: 'docs/python-preset.md',
  },
  {
    id: 'python-types',
    title: 'Python: type checkers and import contracts',
    summary:
      'mypy, pyright and basedpyright diagnostics, import-linter contracts, the dependency checks and mutmut.',
    guide: 'docs/python-preset.md',
  },
];

export const PAGE_IDS = PAGES.map(({ id }) => id);
