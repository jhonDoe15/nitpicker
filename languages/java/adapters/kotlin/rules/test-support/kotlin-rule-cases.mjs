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
    id: 'suspendRunCatching',
    rule: 'detekt.coroutines.SuspendFunSwallowedCancellation',
    message:
      'The `runCatching` has suspend call inside. You should either use specific `try-catch` only catching exception that you are expecting or rethrow the `CancellationException` if already caught.',
    allowedForm: 'direct suspend call',
    banned:
      'suspend fun load(): Result<Unit> = runCatching { fetch() }\nsuspend fun fetch() { kotlinx.coroutines.delay(1) }\n',
    allowed:
      'suspend fun load() { fetch() }\nsuspend fun fetch() { kotlinx.coroutines.delay(1) }\n',
  },
  {
    id: 'aliasedSuspendRunCatching',
    rule: 'detekt.coroutines.SuspendFunSwallowedCancellation',
    message:
      'The `runCatching` has suspend call inside. You should either use specific `try-catch` only catching exception that you are expecting or rethrow the `CancellationException` if already caught.',
    allowedForm: 'direct suspend call',
    banned:
      'import kotlin.runCatching as attempt\n\nsuspend fun load(): Unit = attempt { fetch() }.getOrThrow()\nsuspend fun fetch() { kotlinx.coroutines.delay(1) }\n',
    allowed:
      'import kotlinx.coroutines.delay\n\nsuspend fun load(): Result<Int> {\n    delay(1)\n    return runCatching { "1".toInt() }\n}\n',
  },
  {
    id: 'qualifiedSuspendRunCatching',
    rule: 'detekt.coroutines.SuspendFunSwallowedCancellation',
    message:
      'The `runCatching` has suspend call inside. You should either use specific `try-catch` only catching exception that you are expecting or rethrow the `CancellationException` if already caught.',
    allowedForm: 'direct suspend call',
    banned:
      'suspend fun load(): Unit = kotlin.runCatching { fetch() }.getOrThrow()\nsuspend fun fetch() { kotlinx.coroutines.delay(1) }\n',
    allowed:
      'import java.util.concurrent.CancellationException\n\nsuspend fun load(): Result<Unit> = try {\n    Result.success(fetch())\n} catch (error: CancellationException) {\n    throw error\n} catch (error: java.io.IOException) {\n    Result.failure(error)\n}\n\nsuspend fun fetch() { kotlinx.coroutines.delay(1) }\n',
  },
  {
    id: 'injectedDispatcher',
    rule: 'detekt.coroutines.InjectDispatcher',
    message: 'Dispatcher IO is used without dependency injection.',
    allowedForm: 'inject the dispatcher',
    banned:
      'import kotlinx.coroutines.Dispatchers\nimport kotlinx.coroutines.withContext\n\nsuspend fun load(): Int = withContext(Dispatchers.IO) { 1 }\n',
    allowed:
      'import kotlinx.coroutines.CoroutineDispatcher\nimport kotlinx.coroutines.Dispatchers\nimport kotlinx.coroutines.withContext\n\nsuspend fun load(dispatcher: CoroutineDispatcher = Dispatchers.IO): Int =\n    withContext(dispatcher) { 1 }\n',
  },
  {
    id: 'redundantSuspend',
    rule: 'detekt.coroutines.RedundantSuspendModifier',
    message: 'Function has redundant `suspend` modifier.',
    allowedForm: 'remove the `suspend` modifier',
    banned: 'suspend fun answer(): String = "answer"\n',
    allowed:
      'import kotlinx.coroutines.delay\n\nsuspend fun answer(): String {\n    delay(1)\n    return "answer"\n}\n',
  },
  {
    id: 'sleepInSuspend',
    rule: 'detekt.coroutines.SleepInsteadOfDelay',
    message: 'This use of Thread.sleep() inside a suspend function should be replaced by delay().',
    allowedForm: 'use `delay`',
    banned: 'suspend fun pause() {\n    Thread.sleep(1)\n}\n',
    allowed: 'import kotlinx.coroutines.delay\n\nsuspend fun pause() {\n    delay(1)\n}\n',
  },
  {
    id: 'suspendFlow',
    rule: 'detekt.coroutines.SuspendFunWithFlowReturnType',
    message: '`suspend` function returns Coroutines Flow.',
    allowedForm: 'return the flow from a plain function',
    banned:
      'import kotlinx.coroutines.flow.Flow\nimport kotlinx.coroutines.flow.flowOf\n\nsuspend fun values(): Flow<Int> = flowOf(1)\n',
    allowed:
      'import kotlinx.coroutines.flow.Flow\nimport kotlinx.coroutines.flow.flowOf\n\nfun values(): Flow<Int> = flowOf(1)\n',
  },
  {
    id: 'suspendScopeReceiver',
    rule: 'detekt.coroutines.SuspendFunWithCoroutineScopeReceiver',
    message: '`suspend` function uses CoroutineScope as receiver.',
    allowedForm: 'coroutineScope { ... }',
    banned:
      'import kotlinx.coroutines.CoroutineScope\nimport kotlinx.coroutines.delay\n\nsuspend fun CoroutineScope.pause() {\n    delay(1)\n}\n',
    allowed:
      'import kotlinx.coroutines.coroutineScope\nimport kotlinx.coroutines.delay\nimport kotlinx.coroutines.launch\n\nsuspend fun pause() = coroutineScope {\n    launch { delay(1) }\n}\n',
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
    id: 'unusedParameter',
    rule: 'detekt.style.UnusedParameter',
    message: 'Function parameter `extra` is unused.',
    allowedForm: 'remove the parameter',
    banned: 'fun total(count: Int, extra: Int): Int = count\n',
    allowed:
      'interface Source {\n    fun next(step: Int): Int\n}\n\nclass Counter : Source {\n    override fun next(step: Int): Int = 1\n}\n\nfun total(count: Int, ignoredExtra: Int): Int = count\n\nfun main(args: Array<String>) {\n    total(1, 2)\n}\n\nannotation class Bean\n\n@Bean\nfun wire(name: String): Int = total(1, 2)\n\n@Deprecated("use total")\nfun old(count: Int): Int = count\n',
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
