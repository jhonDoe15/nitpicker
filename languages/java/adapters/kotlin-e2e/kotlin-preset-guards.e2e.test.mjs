import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { runJavaDiff } from '../java-diff.mjs';
import { SOURCE_RULE_IDS } from '../kotlin/rules/kotlin-rules.mjs';
import {
  commitBranch,
  diffOf,
  git,
  gradle,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from './test-support/kotlin-e2e-project.mjs';

const PACKAGE = 'package demo.guards\n\n';
const LOGGER = `${PACKAGE}import java.util.logging.Logger\n\n`;
const LEVELS = `${PACKAGE}import java.util.logging.Level\nimport java.util.logging.Logger\n\n`;
const parser = (handling) =>
  `${LEVELS}class Parser(private val logger: Logger) {\n    fun parse(text: String): Result<Int> {\n        try {\n            return Result.success(text.toInt())\n        } catch (e: NumberFormatException) {\n            ${handling}\n            return Result.failure(e)\n        }\n    }\n}\n`;
const methods = Array.from(
  { length: 21 },
  (_, index) => `    fun m${String(index)}(): String = "m${String(index)}"`,
);

const HTTP = `${PACKAGE}import java.net.URI\nimport java.net.http.HttpClient\nimport java.net.http.HttpRequest\nimport java.net.http.HttpResponse\nimport java.time.Duration\nimport java.util.concurrent.CompletableFuture\n`;
const BODY = `    private fun body(url: String): String {\n        val request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5)).build()\n        return client.send(request, HttpResponse.BodyHandlers.ofString()).body()\n    }\n`;
const prefetch = (task, extra = '') =>
  `${HTTP}${extra === '' ? '' : 'import java.util.concurrent.Semaphore\n'}\nclass Prefetch(private val client: HttpClient) {\n${extra === '' ? '' : '    private val permits = Semaphore(8)\n\n'}    fun pages(urls: List<String>): List<CompletableFuture<String>> =\n        urls.map { url -> CompletableFuture.supplyAsync { ${task}(url) } }\n\n${extra}${BODY}}\n`;
const LIMITED = `    private fun limited(url: String): String {\n        permits.acquire()\n        try {\n            return body(url)\n        } finally {\n            permits.release()\n        }\n    }\n\n`;

const GUARD_ROOT = 'src/main/kotlin/demo/guards';
const GUARD_TEST_ROOT = 'src/test/kotlin/demo/guards';

const BANNED_GUARDS = {
  'State.kt': `${PACKAGE}var counter = 0\n`,
  'Audit.kt': `${LOGGER}class Audit(private val logger: Logger) {\n    fun record(user: String) {\n        logger.info("user $user")\n    }\n}\n`,
  'Shell.kt': `${PACKAGE}fun list(dir: String): Process = ProcessBuilder("sh", "-c", "ls " + dir).start()\n`,
  'Loader.kt': `${LOGGER}class Loader(private val logger: Logger) {\n    fun load(file: java.io.File): String? {\n        try {\n            return file.readText()\n        } catch (e: java.io.IOException) {\n            logger.warning("load failed")\n            return null\n        }\n    }\n}\n`,
  'Flags.kt': `${PACKAGE}fun render(text: String, bold: Boolean): String = if (bold) "<b>$text</b>" else text\n`,
  'TriState.kt': `${PACKAGE}fun toggle(force: Boolean?): Int = if (force == true) 1 else 0\n`,
  'Mutation.kt': `${PACKAGE}fun append(items: MutableList<String>) {\n    items.add("x")\n}\n`,
  'Legacy.kt': `${PACKAGE}@Deprecated("Use current")\nfun legacy(): Int = 1\n\nfun current(): Int = 2\n`,
  'Parser.kt': parser('logger.log(Level.WARNING, "parse failed")'),
  'Secrets.kt': `${PACKAGE}val password = "hunter22x"\n`,
  'OrderHelper.kt': `${PACKAGE}class OrderHelper {\n    fun total(): Int = 1\n}\n`,
  'Commented.kt': `${PACKAGE}fun subtotal(): Int {\n    // val discount = compute(1)\n    return 1\n}\n`,
  'Marked.kt': `${PACKAGE}annotation class Generated\n\n@Generated\nfun keep(): Int = 1\n`,
  'Casts.kt': `${PACKAGE}@Deprecated("Use next")\nfun old(): Int = 1\n\nfun next(): Int = old()\n\n@Suppress("unused")\nfun names(value: Any): List<String> = value as List<String>\n\nfun same(value: String): String = value as String\n`,
  'Wide.kt': `${PACKAGE}class Wide {\n${methods.join('\n')}\n}\n`,
  'Deep.kt': `${PACKAGE}open class Failure : Exception()\n\nopen class OrderFailure : Failure()\n\nopen class PaymentFailure : OrderFailure()\n\nclass CardFailure : PaymentFailure()\n`,
  'Literals.kt': `${PACKAGE}fun labels(): List<String> = listOf("shipping", "shipping", "shipping")\n`,
  'Stream.kt': `${PACKAGE}fun show(): Appendable = System.out.append("shown")\n`,
  'App.kt': `${PACKAGE}fun main() {\n    ProcessBuilder("serve", "--port", System.getenv("PORT")).inheritIO().start()\n}\n`,
  'Prefetch.kt': prefetch('body'),
};

const BANNED_TESTS = {
  'EmptyTest.kt': `${PACKAGE}class EmptyTest {\n    fun setUp() = Unit\n}\n`,
};

const ALLOWED_GUARDS = {
  'State.kt': `${PACKAGE}val names = listOf("a")\n`,
  'Audit.kt': `${LOGGER}class Audit(private val logger: Logger) {\n    fun record(user: String) {\n        logger.info { "user $user" }\n    }\n}\n`,
  'Shell.kt': `${PACKAGE}fun list(dir: String): Process = ProcessBuilder("ls", dir).start()\n`,
  'Loader.kt': `${PACKAGE}class Loader {\n    fun load(file: java.io.File): String {\n        try {\n            return file.readText()\n        } catch (e: java.io.IOException) {\n            throw IllegalStateException("load failed", e)\n        }\n    }\n}\n`,
  'Flags.kt': `${PACKAGE}fun plain(text: String): String = text\n\nfun bold(text: String): String = "<b>$text</b>"\n`,
  'TriState.kt': `${PACKAGE}fun describe(force: Boolean): String = "forced=$force"\n`,
  'Mutation.kt': `${PACKAGE}fun append(items: List<String>): List<String> = items + "x"\n`,
  'Legacy.kt': `${PACKAGE}fun current(): Int = 2\n`,
  'Parser.kt': parser('logger.log(Level.WARNING, "parse failed", e)'),
  'Secrets.kt': `${PACKAGE}data class Credentials(val password: String)\n`,
  'PriceRounder.kt': `${PACKAGE}class PriceRounder {\n    fun round(cents: Int): Int = cents\n}\n`,
  'Stream.kt': `${PACKAGE}fun show(out: Appendable): Appendable = out.append("shown")\n`,
  'Commented.kt': `${PACKAGE}// Totals are in cents, so rounding stays exact.\nfun subtotal(): Int = 1\n`,
  'Marked.kt': `${PACKAGE}fun keep(): Int = 1\n`,
  'Casts.kt': `${PACKAGE}fun next(): Int = 1\n\nfun names(value: Any): List<String> = (value as? List<*>).orEmpty().filterIsInstance<String>()\n\nfun same(value: String): String = value\n`,
  'Literals.kt': `${PACKAGE}private const val SHIPPING = "shipping"\n\nfun labels(): List<String> = listOf(SHIPPING, SHIPPING, SHIPPING)\n\nfun kind(text: String): Int = when (text) {\n    "shipping-pending" -> 1\n    "shipping-sent", "shipping-pending" -> 2\n    else -> 3\n}\n\nfun more(): Map<String, Int> = mapOf("shipping-pending" to 1)\n`,
  'App.kt': `${PACKAGE}fun main() {\n    ProcessBuilder("serve", "--port", System.getenv("PORT")).inheritIO().start()\n    show(System.out)\n}\n`,
  'Prefetch.kt': prefetch('limited', LIMITED),
};

const ALLOWED_TESTS = {
  'OrderTest.kt': `${PACKAGE}import kotlin.test.Test\nimport kotlin.test.assertEquals\n\nclass OrderTest {\n    @Test\n    fun totals() {\n        assertEquals(1, subtotal())\n        assertEquals("shipping", "shipping")\n        assertEquals("shipping", "shipping")\n    }\n}\n`,
};

function guardFiles(sources, tests) {
  return {
    ...Object.fromEntries(
      Object.entries(sources).map(([name, text]) => [`${GUARD_ROOT}/${name}`, text]),
    ),
    ...Object.fromEntries(
      Object.entries(tests).map(([name, text]) => [`${GUARD_TEST_ROOT}/${name}`, text]),
    ),
  };
}

const EXPECTED_BANNED = [
  'kotlin-source/MutableModuleState State.kt',
  'kotlin-source/LogStringConcatenation Audit.kt',
  'kotlin-source/ShellCommand Shell.kt',
  'kotlin-source/StandardStreamOutsideEntryPoint Stream.kt',
  'kotlin-source/CatchOnlyLogsOrReturnsDefault Loader.kt',
  'detekt/catch-log-without-exception Parser.kt',
  'kotlin-source/BooleanFlagParameter Flags.kt',
  'kotlin-source/TriStateBoolean TriState.kt',
  'kotlin-source/ParameterMutation Mutation.kt',
  'kotlin-source/CompatibilityShim Legacy.kt',
  'kotlin-source/CompatibilityShim Casts.kt',
  'kotlin-source/HardcodedSecret Secrets.kt',
  'kotlin-source/GenericTypeName OrderHelper.kt',
  'kotlin-source/CommentedOutCode Commented.kt',
  'kotlin-source/RepeatedStringLiteral Literals.kt',
  'kotlin-source/GeneratedOnHandWrittenCode Marked.kt',
  'kotlin-source/TestClassWithoutTestCases EmptyTest.kt',
  'kotlin-source/UnboundedFanOut Prefetch.kt',
  'kotlinc/deprecation Casts.kt',
  'kotlinc/unchecked Casts.kt',
  'kotlinc/cast Casts.kt',
  'structure/class-methods-limit Wide.kt',
  'structure/inheritance-depth-limit Deep.kt',
].toSorted();

const GUARD_TOOLS = new Set(['kotlin-source', 'kotlinc']);
const CLASS_RULES = new Set([
  'class-methods-limit',
  'class-fields-limit',
  'inheritance-depth-limit',
]);

const DETEKT_SOURCE_RULES = new Set(SOURCE_RULE_IDS);

function guardFindings(findings) {
  return findings.filter(
    ({ tool, rule }) =>
      GUARD_TOOLS.has(tool) ||
      (tool === 'structure' && CLASS_RULES.has(rule)) ||
      (tool === 'detekt' && DETEKT_SOURCE_RULES.has(rule)),
  );
}

function printedRule({ tool, rule }) {
  return tool === 'structure' || tool === 'detekt' ? rule : `${tool}/${rule}`;
}

function summary(findings) {
  return guardFindings(findings)
    .map(({ tool, rule, path: file }) => `${tool}/${rule} ${path.basename(file)}`)
    .toSorted();
}

describe.skipIf(!kotlinE2eEnabled)(
  'Kotlin preset source guards, compiler warnings and class limits end to end',
  () => {
    let project;
    let banned;
    let allowed;

    beforeAll(() => {
      project = initializeProject();
      commitBranch(project, 'guards-banned', guardFiles(BANNED_GUARDS, BANNED_TESTS));
      commitBranch(project, 'guards-allowed', guardFiles(ALLOWED_GUARDS, ALLOWED_TESTS));
      banned = diffOf(project, 'guards-banned');
      allowed = diffOf(project, 'guards-allowed');
    });
    afterAll(() => {
      removeProject(project);
    });

    it('fails every banned form with its own rule', () => {
      expect(summary(banned.newEnforceable)).toEqual(EXPECTED_BANNED);
      expect(banned.newFindings.some(({ rule }) => rule === 'lint-not-run')).toBe(false);
    });

    it('lets every allowed form through, the composition root reading the environment among them', () => {
      expect(summary(allowed.newFindings)).toEqual([]);
      expect(
        allowed.newEnforceable.filter(({ path: file }) => file.endsWith(`${GUARD_ROOT}/App.kt`)),
      ).toEqual([]);
    });

    it('ends each finding with the exception sentence of the rule it prints', () => {
      const wrong = guardFindings(banned.newEnforceable)
        .filter(
          (finding) => !finding.message.endsWith(exceptionHint(printedRule(finding), finding.path)),
        )
        .map(({ tool, rule }) => `${tool}/${rule}`);

      expect(wrong).toEqual([]);
    });

    it('lifts a source rule for the paths of an exception only', () => {
      git(project, 'checkout', '-q', 'guards-banned');
      const result = runJavaDiff({
        repositoryRoot: project.root,
        requestedBaseRef: 'main',
        gradle,
        policy: {
          ...kotlinPolicy,
          exceptions: [
            { rule: 'kotlin-source/MutableModuleState', glob: `${GUARD_ROOT}/State.kt` },
          ],
        },
      });

      expect(summary(result.newEnforceable)).toEqual(
        EXPECTED_BANNED.filter((entry) => entry !== 'kotlin-source/MutableModuleState State.kt'),
      );
    });
  },
);
