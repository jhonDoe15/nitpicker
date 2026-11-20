import type { RecipeFix } from '../../../../../core/fix/typed/fix-types.mts';
import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import { maskedOf } from '../source/java-text.mts';

export type TestClassFile = { readonly path: string; readonly text: string };
export type GradleGroup = {
  readonly buildFile: string;
  readonly buildText: string;
  readonly set: string;
  readonly classes: readonly TestClassFile[];
  readonly scripts: readonly string[];
};
export type Planned = { readonly fix: RecipeFix } | { readonly declined: string };

const RULE = { tool: 'test-runtime', rule: 'test-not-run' };
const FOREIGN_SUITES = /\b(?:JvmTestSuite|testSets|test-sets|testing\s*\{)/u;

function registered(text: string, set: string): boolean {
  const name = escapeRegExp(set);
  return new RegExp(
    String.raw`tasks\s*\.\s*(?:register|create)(?:<[^>]*>\s*)?\(\s*["']${name}["']|\btask(?:\s*\(\s*|\s+)["']?${name}\b`,
    'u',
  ).test(text);
}

function snippet(set: string, kotlin: boolean, platform: boolean): string {
  const lines = kotlin
    ? [
        `tasks.register<Test>("${set}") {`,
        `    description = "Runs the ${set} source set."`,
        '    group = "verification"',
        `    testClassesDirs = sourceSets["${set}"].output.classesDirs`,
        `    classpath = sourceSets["${set}"].runtimeClasspath`,
        '    shouldRunAfter(tasks.named("test"))',
        ...(platform ? ['    useJUnitPlatform()'] : []),
        '}',
        '',
        'tasks.named("check") {',
        `    dependsOn("${set}")`,
        '}',
      ]
    : [
        `tasks.register('${set}', Test) {`,
        `    description = 'Runs the ${set} source set.'`,
        "    group = 'verification'",
        `    testClassesDirs = sourceSets['${set}'].output.classesDirs`,
        `    classpath = sourceSets['${set}'].runtimeClasspath`,
        "    shouldRunAfter tasks.named('test')",
        ...(platform ? ['    useJUnitPlatform()'] : []),
        '}',
        '',
        "tasks.named('check') {",
        `    dependsOn '${set}'`,
        '}',
      ];
  return `${lines.join('\n')}\n`;
}

const SHARED_CONFIGURATION = /\bapply\s*(?:\(\s*)?from\b|\bsubprojects\s*\{|\ballprojects\s*\{/u;

function problemOf({ buildText, set, classes, scripts }: GradleGroup): string | undefined {
  if (buildText.includes(`Runs the ${set} source set.`)) {
    return '';
  }
  const quoted = new RegExp(String.raw`["']${escapeRegExp(set)}["']`, 'u');
  if (
    [buildText, ...scripts].some((script) => SHARED_CONFIGURATION.test(script)) ||
    scripts.some((script) => quoted.test(script))
  ) {
    return 'another build script may already configure a test task for it';
  }
  const { literals } = maskedOf(buildText);
  const name = escapeRegExp(set);
  const declared = new RegExp(String.raw`["']${name}["']|\b${name}\s*\{`, 'u');
  if (!declared.test(literals)) {
    return `${set} is not declared in this build file`;
  }
  if (registered(buildText, set) || /\btestClassesDirs\b/u.test(buildText)) {
    return `this build file already configures a test task for ${set}`;
  }
  if (FOREIGN_SUITES.test(buildText)) {
    return 'this build file declares test suites that the fix does not follow';
  }
  return classes.some(({ text }) => /org\.testng\./u.test(text))
    ? 'the tests run on TestNG, which the fix does not configure'
    : undefined;
}

export function gradleFix(group: GradleGroup): Planned {
  const problem = problemOf(group);
  const [first, ...rest] = group.classes;
  if (problem !== undefined || first === undefined) {
    return { declined: problem ?? 'no test class' };
  }
  const platform =
    /\buseJUnitPlatform\b/u.test(group.buildText) ||
    group.classes.some(({ text }) => /org\.junit\.jupiter\./u.test(text));
  const { buildText, buildFile, set } = group;
  const separator = buildText.endsWith('\n') ? '\n' : '\n\n';
  return {
    fix: {
      finding: { ...RULE, path: first.path, line: 1 },
      alsoFixes: rest.map(({ path }) => ({ ...RULE, path, line: 1 })),
      edits: [
        {
          type: 'replace',
          path: buildFile,
          start: buildText.length,
          end: buildText.length,
          text: separator + snippet(set, buildFile.endsWith('.kts'), platform),
        },
      ],
    },
  };
}
