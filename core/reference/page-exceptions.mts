import { JAVA_TOOLS } from '../../languages/java/adapters/gradle-presets.mjs';
import { JAVA_EXCEPTION_RULES } from '../../languages/java/adapters/java-policy.mjs';
import { KOTLIN_EXCEPTION_RULES } from '../../languages/java/adapters/kotlin/kotlin-options.mjs';
import { joinedWords } from '../../shared/reference/entry.mjs';

const wordsJoined: (words: readonly string[]) => string = joinedWords;
const javaTools: readonly string[] = JAVA_TOOLS;
const javaExceptionRules: readonly string[] = JAVA_EXCEPTION_RULES;
const kotlinExceptionRules: readonly string[] = KOTLIN_EXCEPTION_RULES;

const JAVA_PAGES = [
  'java-pmd',
  'java-checkstyle',
  'java-spotbugs',
  'java-errorprone',
  'java-nitpicker',
];
const KOTLIN_PAGES = ['kotlin-detekt', 'kotlin-nitpicker'];

function codes(names: readonly string[]): string {
  return wordsJoined(names.map((name) => `\`${name}\``));
}

function javaText(): string {
  return `In the Java preset, an entry of \`exceptions\` names a finding as it prints, \`<tool>/<rule>\` with one of the tools ${codes(javaTools)}, or one of these rules: ${codes(javaExceptionRules)}. The Kotlin preset takes the same \`<tool>/<rule>\` form for the Java sources of a mixed module.`;
}

function kotlinText(): string {
  return `In the Kotlin preset, an entry of \`exceptions\` names a detekt rule as \`detekt.<ruleset>.<Rule>\`, one of these rules: ${codes(kotlinExceptionRules)}, or, for the Java sources of the project, a finding as it prints, \`<tool>/<rule>\` with one of the tools ${codes(javaTools)}.`;
}

export function pageExceptionTexts(): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...JAVA_PAGES.map((page): [string, string] => [page, javaText()]),
    ...KOTLIN_PAGES.map((page): [string, string] => [page, kotlinText()]),
  ]);
}
