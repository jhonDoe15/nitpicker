const CLOCK =
  'Inject a `java.time.Clock` and call `now(clock)` (`Instant.now(clock)`), so the code can be tested with a fixed time.';
const RANDOM =
  'Inject a `kotlin.random.Random` and call it (`random.nextInt(6)`), so the code can be tested with `Random(seed)`.';
const THREAD =
  'Do not start threads by hand. Launch a coroutine in a scope its owner cancels, or submit the work to an injected `ExecutorService`.';
const LEGACY_DATE =
  'Use java.time (`Instant`, `LocalDate`, `ZonedDateTime`, `ZoneId` and `DateTimeFormatter`) instead of the legacy date classes. Convert a `Date` another API returns with `toInstant()` in the same expression.';
const COROUTINES = 'import kotlinx.coroutines.coroutineScope\nimport kotlinx.coroutines.launch\n\n';

function forbidden(call, reason) {
  return `The method \`${call}\` has been forbidden: ${reason}`;
}

export const kotlinGuardCases = [
  {
    id: 'consolePrint',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'kotlin.io.println',
      'Log through the application logger (`logger.info(...)`) instead of printing to the console.',
    ),
    allowedForm: 'logger.info(',
    banned: 'fun show() {\n    println("shown")\n}\n',
    allowed: 'fun show(logger: java.util.logging.Logger) {\n    logger.info("shown")\n}\n',
  },
  {
    id: 'environment',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'java.lang.System.getenv',
      'Read environment variables only in the composition root (the file with `fun main`, the `@SpringBootApplication` class or a Ktor `Application` module): read them once into a config class there and pass it in.',
    ),
    allowedForm: 'composition root',
    banned: 'fun home(): String? = System.getenv("HOME")\n',
    allowed:
      'fun main() {\n    ProcessBuilder("serve", "--port", System.getenv("PORT")).inheritIO().start()\n}\n',
  },
  {
    id: 'clockNow',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden('java.time.Instant.now()', CLOCK),
    allowedForm: 'now(clock)',
    banned: 'fun stamp(): java.time.Instant = java.time.Instant.now()\n',
    allowed:
      'fun stamp(clock: java.time.Clock): java.time.Instant = java.time.Instant.now(clock)\n',
  },
  {
    id: 'currentMillis',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'java.lang.System.currentTimeMillis',
      'Inject a `java.time.Clock` and call `clock.millis()`, so the code can be tested with a fixed time.',
    ),
    allowedForm: 'clock.millis()',
    banned: 'fun millis(): Long = System.currentTimeMillis()\n',
    allowed: 'fun millis(clock: java.time.Clock): Long = clock.millis()\n',
  },
  {
    id: 'defaultRandom',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden('kotlin.random.Random.Default.nextInt', RANDOM),
    allowedForm: 'random.nextInt(6)',
    banned: 'fun roll(): Int = kotlin.random.Random.nextInt(2)\n',
    allowed: 'fun roll(random: kotlin.random.Random): Int = random.nextInt(2)\n',
  },
  {
    id: 'collectionRandom',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'kotlin.collections.random(kotlin.collections.Collection)',
      'Pass an injected `kotlin.random.Random`: `items.random(random)`, so the code can be tested with `Random(seed)`.',
    ),
    allowedForm: 'items.random(random)',
    banned: 'fun pick(items: List<String>): String = items.random()\n',
    allowed:
      'fun pick(items: List<String>, random: kotlin.random.Random): String = items.random(random)\n',
  },
  {
    id: 'threadSleep',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'java.lang.Thread.sleep',
      'Do not sleep in production code. Schedule the work (`ScheduledExecutorService`) or wait on the condition.',
    ),
    allowedForm: 'ScheduledExecutorService',
    banned: 'fun nap() {\n    Thread.sleep(1)\n}\n',
    allowed:
      'fun later(scheduler: java.util.concurrent.ScheduledExecutorService, task: Runnable) {\n    scheduler.schedule(task, 1, java.util.concurrent.TimeUnit.SECONDS)\n}\n',
  },
  {
    id: 'runtimeExec',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'java.lang.Runtime.exec',
      'Run commands with `ProcessBuilder` and an argument list (`ProcessBuilder("git", "log", ref)`), never a command string.',
    ),
    allowedForm: 'ProcessBuilder("git", "log", ref)',
    banned: 'fun list(): Process = Runtime.getRuntime().exec(arrayOf("ls"))\n',
    allowed: 'fun list(): Process = ProcessBuilder("ls").start()\n',
  },
  {
    id: 'deserialization',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden(
      'java.io.ObjectInputStream.<init>',
      'Do not read Java-serialized objects. Use JSON or another data format (kotlinx.serialization).',
    ),
    allowedForm: 'kotlinx.serialization',
    banned:
      'fun read(input: java.io.InputStream): Any? = java.io.ObjectInputStream(input).readObject()\n',
    allowed: 'fun read(input: java.io.InputStream): String = input.bufferedReader().readText()\n',
  },
  {
    id: 'threadStart',
    rule: 'detekt.style.ForbiddenMethodCall',
    message: forbidden('kotlin.concurrent.thread', THREAD),
    allowedForm: 'launch a coroutine',
    banned: 'fun work(task: () -> Unit) {\n    kotlin.concurrent.thread { task() }\n}\n',
    allowed: `${COROUTINES}suspend fun work(task: () -> Unit) = coroutineScope {\n    launch { task() }\n}\n`,
  },
  {
    id: 'legacyDate',
    rule: 'detekt.style.ForbiddenImport',
    message: `The import \`java.util.Date\` has been forbidden: ${LEGACY_DATE}`,
    allowedForm: 'java.time',
    banned:
      'import java.util.Date\n\nfun stamp(clock: java.time.Clock): Date = Date.from(clock.instant())\n',
    allowed: 'fun stamp(clock: java.time.Clock): java.time.Instant = clock.instant()\n',
  },
  {
    id: 'todoComment',
    rule: 'detekt.style.ForbiddenComment',
    message:
      'A TODO or FIXME needs an issue reference: write `TODO(#123): ...` or `TODO PROJ-123: ...`, or do the work now.',
    allowedForm: 'TODO(#123)',
    banned: '// TODO fix the rounding\nfun round(value: Double): Long = Math.round(value)\n',
    allowed: '// TODO(#12): fix the rounding\nfun round(value: Double): Long = Math.round(value)\n',
  },
  {
    id: 'repeatedLiteral',
    rule: 'detekt.complexity.StringLiteralDuplication',
    message:
      'Multiple occurrences of the same string literal within a single file detected. Prefer extracting the string literal into a property or constant.',
    allowedForm: 'private const val',
    banned: 'fun labels(): List<String> = listOf("shipping", "shipping", "shipping")\n',
    allowed:
      'private const val SHIPPING = "shipping"\n\nfun labels(): List<String> = listOf(SHIPPING, SHIPPING, SHIPPING)\n',
  },
];
