import { SUPPRESSION_RULE } from '../kotlin-rules.mjs';
import { kotlinGuardCases } from './kotlin-guard-cases.mjs';

const COROUTINE_IMPORTS =
  'import kotlinx.coroutines.GlobalScope\nimport kotlinx.coroutines.launch\n';

export const kotlinRuleCases = [
  {
    id: 'nullAssertion',
    rule: 'detekt.potential-bugs.UnsafeCallOnNullableType',
    message:
      'Calling !! on a nullable type will throw a NullPointerException at runtime in case the value is null. It should be avoided.',
    allowedForm: 'checkNotNull(value)',
    banned: 'fun length(text: String?): Int = text!!.length\n',
    allowed: 'fun length(text: String?): Int = text?.length ?: 0\n',
  },
  {
    id: 'nullCast',
    rule: 'detekt.potential-bugs.CastNullableToNonNullableType',
    message:
      "Use separate `null` assertion and type cast like ('(value ?: error(\"null assertion message\")) as String') instead of 'value as String'.",
    allowedForm: 'value ?: error(',
    banned: 'fun text(value: Any?): String = value as String\n',
    allowed: 'fun text(value: Any?): String = value as? String ?: "none"\n',
  },
  {
    id: 'broadCatch',
    rule: 'detekt.exceptions.TooGenericExceptionCaught',
    message:
      'The caught exception is too generic. Prefer catching specific exceptions to the case that is currently handled.',
    allowedForm: 'catching specific exceptions',
    banned:
      'fun number(text: String): Int =\n    try {\n        text.toInt()\n    } catch (error: Exception) {\n        error.hashCode()\n    }\n',
    allowed:
      'fun number(text: String): Int =\n    try {\n        text.toInt()\n    } catch (error: NumberFormatException) {\n        0\n    }\n',
  },
  {
    id: 'globalScope',
    rule: 'detekt.coroutines.GlobalCoroutineUsage',
    message: 'This use of GlobalScope should be replaced by `CoroutineScope` or `coroutineScope`.',
    allowedForm: 'coroutineScope',
    banned: `${COROUTINE_IMPORTS}\nfun start() {\n    GlobalScope.launch { }\n}\n`,
    allowed:
      'import kotlinx.coroutines.coroutineScope\nimport kotlinx.coroutines.launch\n\nsuspend fun start() = coroutineScope {\n    launch { }\n}\n',
  },
  {
    id: 'runBlocking',
    rule: 'detekt.style.ForbiddenMethodCall',
    message:
      'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work. In a test, use `runTest`.',
    allowedForm: 'suspend fun main()',
    banned: 'import kotlinx.coroutines.runBlocking\n\nfun wait(): Int = runBlocking { 1 }\n',
    allowed: 'import kotlinx.coroutines.delay\n\nsuspend fun wait() {\n    delay(1)\n}\n',
  },
  {
    id: 'scopeRun',
    rule: 'detekt.style.ForbiddenMethodCall',
    message:
      'The method `kotlin.run` has been forbidden: Use `let` to name a value for a block (`value?.let { ... }` for null), or call the code directly.',
    allowedForm: '`let`',
    banned: 'fun size(text: String): Int = text.run { length }\n',
    allowed: 'fun size(text: String): Int = text.length\n',
  },
  {
    id: 'scopeWith',
    rule: 'detekt.style.ForbiddenMethodCall',
    message:
      'The method `kotlin.with` has been forbidden: Use `apply` to configure an object (`StringBuilder().apply { ... }`), or call the members on the receiver.',
    allowedForm: '`apply`',
    banned: 'fun size(text: String): Int = with(text) { length }\n',
    allowed: 'fun make(): StringBuilder = StringBuilder().apply { append("a") }\n',
  },
  {
    id: 'scopeAlso',
    rule: 'detekt.style.ForbiddenMethodCall',
    message:
      'The method `kotlin.also` has been forbidden: Use `apply` to configure an object, or write a plain statement after it.',
    allowedForm: '`apply`',
    banned: 'fun make(): StringBuilder = StringBuilder().also { it.append("a") }\n',
    allowed: 'fun make(): StringBuilder = StringBuilder().apply { append("a") }\n',
  },
  {
    id: 'unnecessaryLet',
    rule: 'detekt.style.UnnecessaryLet',
    message: 'let expression can be omitted',
    allowedForm: 'call the member directly',
    banned: 'fun size(text: String): Int = text.let { it.length }\n',
    allowed: 'fun size(text: String): Int = text.length\n',
  },
  {
    id: 'unnecessaryApply',
    rule: 'detekt.style.UnnecessaryApply',
    message: 'apply expression can be omitted',
    allowedForm: 'configure an object you just created',
    banned: 'fun add(builder: StringBuilder) {\n    builder.apply { append("a") }\n}\n',
    allowed: 'fun add(builder: StringBuilder) {\n    builder.append("a")\n}\n',
  },
  {
    id: 'ifNull',
    rule: 'detekt.style.UseLet',
    message:
      'Use `?.let {}` instead of if/else with a null block when checking for nullable values',
    allowedForm: '?.let',
    banned: 'fun describe(text: String?): String? = if (text == null) null else "Text: $text"\n',
    allowed: 'fun describe(text: String?): String? = text?.let { "Text: $it" }\n',
  },
  {
    id: 'recordClass',
    rule: 'detekt.style.UseDataClass',
    message:
      'The class {name} defines no functionality and only holds data. Consider converting it to a data class.',
    allowedForm: 'data class',
    banned: 'class {name}(val x: Int, val y: Int)\n',
    allowed: 'data class {name}(val x: Int, val y: Int)\n',
  },
  {
    id: 'mutableRecord',
    rule: 'detekt.style.DataClassShouldBeImmutable',
    message:
      'The data class {name} contains a mutable property. The offending property is called count',
    allowedForm: 'copy(',
    banned: 'data class {name}(var count: Int)\n',
    allowed: 'data class {name}(val count: Int)\n',
  },
  {
    id: 'suppression',
    rule: SUPPRESSION_RULE,
    message: undefined,
    allowedForm: 'Fix the code',
    banned:
      '@Suppress("UnsafeCallOnNullableType")\nfun length(text: String?): Int = text!!.length\n',
    allowed: 'fun length(text: String?): Int = text?.length ?: 0\n',
  },
  ...kotlinGuardCases,
];

const VARIANT_NAMES = { banned: 'Banned', allowed: 'Allowed' };

export function fixtureSource(testCase, variant) {
  return `package demo.${testCase.id}\n\n${testCase[variant].replaceAll('{name}', VARIANT_NAMES[variant])}`;
}

export function fixturePath(testCase, variant) {
  return `src/main/kotlin/demo/${testCase.id}/${VARIANT_NAMES[variant]}.kt`;
}

export function expectedMessage(testCase, variant) {
  return testCase.message?.replaceAll('{name}', VARIANT_NAMES[variant]);
}
