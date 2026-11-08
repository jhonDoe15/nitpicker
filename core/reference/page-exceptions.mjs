import { JAVA_TOOLS } from '../../languages/java/adapters/gradle-presets.mjs';
import { JAVA_EXCEPTION_RULES } from '../../languages/java/adapters/java-policy.mjs';
import { KOTLIN_EXCEPTION_RULES } from '../../languages/java/adapters/kotlin/kotlin-options.mjs';
import { joinedWords } from '../../shared/reference/entry.mjs';

const JAVA_PAGES = [
  'java-pmd',
  'java-checkstyle',
  'java-spotbugs',
  'java-errorprone',
  'java-nitpicker',
];
const KOTLIN_PAGES = ['kotlin-detekt', 'kotlin-nitpicker'];

function codes(names) {
  return joinedWords(names.map((name) => `\`${name}\``));
}

function javaText() {
  return `In the Java preset, an entry of \`exceptions\` names a finding as it prints, \`<tool>/<rule>\` with one of the tools ${codes(JAVA_TOOLS)}, or one of these rules: ${codes(JAVA_EXCEPTION_RULES)}. The Kotlin preset takes the same \`<tool>/<rule>\` form for the Java sources of a mixed module.`;
}

function kotlinText() {
  return `In the Kotlin preset, an entry of \`exceptions\` names a detekt rule as \`detekt.<ruleset>.<Rule>\`, one of these rules: ${codes(KOTLIN_EXCEPTION_RULES)}, or, for the Java sources of the project, a finding as it prints, \`<tool>/<rule>\` with one of the tools ${codes(JAVA_TOOLS)}.`;
}

/** The paragraph of each JVM page that says which rules its preset's `exceptions` take, from the validation lists. */
export function pageExceptionTexts() {
  return Object.fromEntries([
    ...JAVA_PAGES.map((page) => [page, javaText()]),
    ...KOTLIN_PAGES.map((page) => [page, kotlinText()]),
  ]);
}
