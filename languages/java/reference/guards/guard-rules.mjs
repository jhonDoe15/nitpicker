import { readFileSync } from 'node:fs';
import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import { LINT_ADVICE } from '../../guards/javac-lint.mjs';

const JVM = { page: 'java-nitpicker', analyzers: JVM_ANALYZERS, builds: JVM_BUILDS };
const GUARDS_DOCS = [{ label: 'Java preset guards', path: 'docs/java-preset/guards.md' }];
const FORBIDDEN_APIS = new URL('../../gradle/rules/forbidden-apis.txt', import.meta.url);
const DEFAULT_MESSAGE = /^@defaultMessage ([a-z-]+): (.+)$/gmu;
const FORBIDDEN_SUMMARIES = {
  'legacy-date-time':
    'A call of the legacy date classes: `Date`, `Calendar`, `TimeZone` or `SimpleDateFormat`.',
  'clock-now': 'A `now()` call of a `java.time` class that takes no `Clock`.',
  'thread-sleep': 'A `Thread.sleep` or `TimeUnit.sleep` call in main code.',
  'runtime-exec': 'A `Runtime.exec` call that runs a command string.',
  'java-deserialization': 'A `new ObjectInputStream`, which reads Java-serialized objects.',
  'new-thread': 'A `Thread.start` call, which starts a thread by hand.',
};
const FORBIDDEN_WHY =
  "The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.";
const LINT_SUMMARIES = {
  rawtypes: 'A generic type used without its type arguments.',
  unchecked: 'An operation javac cannot check at compile time, such as an unchecked cast.',
  deprecation: 'A call of an API marked `@Deprecated`.',
  removal: 'A call of an API marked `@Deprecated(forRemoval = true)`.',
  cast: 'A cast to the type the expression already has.',
};
const LINT_WHY =
  'A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.';
function forbiddenMessages() {
  const text = readFileSync(FORBIDDEN_APIS, 'utf8');
  return new Map([...text.matchAll(DEFAULT_MESSAGE)].map(([, rule, message]) => [rule, message]));
}

function forbiddenEntries() {
  return [...forbiddenMessages()].map(([rule, allowed]) =>
    ruleEntry({
      ...JVM,
      tool: 'forbiddenapis',
      rule,
      summary: FORBIDDEN_SUMMARIES[rule],
      why: FORBIDDEN_WHY,
      allowed,
      exception: { key: 'exceptions', rule: `forbiddenapis/${rule}` },
      docs: GUARDS_DOCS,
    }),
  );
}

function lintEntries() {
  return Object.entries(LINT_ADVICE).map(([rule, allowed]) =>
    ruleEntry({
      ...JVM,
      tool: 'javac',
      rule,
      summary: LINT_SUMMARIES[rule],
      why: LINT_WHY,
      allowed,
      exception: { key: 'exceptions', rule: `javac/${rule}` },
      docs: GUARDS_DOCS,
    }),
  );
}

function dependencyEntry() {
  return ruleEntry({
    ...JVM,
    tool: 'dependencies',
    rule: 'unused-declared-dependency',
    summary: 'A dependency declared for the main sources that no main class uses.',
    why: 'A dependency nothing uses widens the class path and the attack surface, and the build still resolves it on every run.',
    allowed:
      'Remove it, or declare it where it is used: testImplementation, runtimeOnly or compileOnly (Maven: test, runtime or provided scope).',
    exception: { key: 'exceptions', rule: 'dependencies/unused-declared-dependency' },
    docs: GUARDS_DOCS,
  });
}

/** The entries of the guard rules that javac, forbidden-apis, Checkstyle and the build checks report. */
export function guardRuleEntries() {
  return [...forbiddenEntries(), ...lintEntries(), dependencyEntry()];
}
