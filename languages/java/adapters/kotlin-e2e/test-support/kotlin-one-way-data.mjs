import {
  kotlinRuleCases,
  fixturePath,
  fixtureSource,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';

export function ruleFixtures(variant) {
  return Object.fromEntries(
    kotlinRuleCases.map((testCase) => [
      fixturePath(testCase, variant),
      fixtureSource(testCase, variant),
    ]),
  );
}

export const HOSTILE_DETEKT_CONFIG = `formatting:
  active: true
  Indentation:
    active: true
compose:
  active: true
style:
  active: false
  excludes: ['**/*.kt']
  ForbiddenMethodCall:
    active: false
    severity: info
    excludes: ['**/*.kt']
    methods:
      - 'kotlin.io.println'
coroutines:
  active: false
potential-bugs:
  active: false
  UnsafeCallOnNullableType:
    severity: info
  CastNullableToNonNullableType:
    excludes: ['**/*.kt']
`;

export const EXTRA_SOURCES = {
  'Wildcard.kt':
    'package demo.extras\n\nimport kotlinx.coroutines.*\n\nfun waitWildcard(): Int = runBlocking { 1 }\n',
  'Qualified.kt':
    'package demo.extras\n\nfun waitQualified(): Int = kotlinx.coroutines.runBlocking { 1 }\n',
  'Holder.kt': 'package demo.extras\n\nclass Holder(var count: Int)\n',
  'convention.gradle.kts': 'println("a script next to the sources")\n',
  'Hidden.kt':
    '@file:Suppress("ktlint:standard:indent")\n\npackage demo.extras\n\nval pattern = "**/*.kt"\nval maybe: String? = "a"\n\n@get:Suppress("UnsafeCallOnNullableType")\nval size: Int get() = maybe!!.length\n\n/** end */\n',
  'Compiler.kt':
    'package demo.extras\n\n@Suppress("UNCHECKED_CAST", "unused")\nfun cast(value: Any): List<String> = value as List<String>\n',
};
