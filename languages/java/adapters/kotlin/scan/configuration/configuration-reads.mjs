import { CONFIGURATION_READ_RULE } from '../../../spring/configuration/covered-reads.mjs';
import { inImport, literalAt, splitArguments } from '../kotlin-source.mjs';
import { isConfigurationRoot } from './configuration-roots.mjs';

const READ =
  /(?<![\w.])(?:java\s*\.\s*lang\s*\.\s*)?(?:System\s*\.\s*getProperty|Integer\s*\.\s*getInteger|Long\s*\.\s*getLong|Boolean\s*\.\s*getBoolean)\s*\(/gu;
const REFERENCE = /(?<![\w.])(?:java\s*\.\s*lang\s*\.\s*)?System\s*::\s*getProperty(?!\w)/gu;
const JVM_KEY = /^(?:java|user|os|file|line|path|javax|jdk|sun|com\.sun|http|https|ftp)\.|^socks/u;
const CONFIGURATION_MESSAGES = {
  [CONFIGURATION_READ_RULE]:
    'Read environment variables and system properties once in the composition root (the file with `fun main`, a Ktor `Application` module, a Guice or Dagger module, a CDI or Micronaut factory) or through the typed configuration of the framework, and pass the values in through constructors or parameters, not `System.getProperty`, `Integer.getInteger`, `java.lang.Long.getLong` or `java.lang.Boolean.getBoolean`. JVM properties such as `java.*`, `user.*`, `javax.*`, `jdk.*` and `http.*` are fine. A library reading its own opt-in switch (`-Dmylib.debug`) takes an exception.',
};

function readsJvmKey(scanned, match) {
  const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
  const first = parts[0];
  if (first === undefined) {
    return false;
  }
  const text = scanned.code.slice(first.start, first.end);
  const start = first.start + text.length - text.trimStart().length;
  const literal = literalAt(scanned, start);
  return (
    literal !== undefined &&
    !literal.template &&
    literal.end - start === text.trim().length &&
    JVM_KEY.test(literal.text)
  );
}

export function configurationReads(scanned) {
  if (isConfigurationRoot(scanned)) {
    return [];
  }
  const calls = [...scanned.code.matchAll(READ)].filter(
    (match) => !inImport(scanned.code, match.index) && !readsJvmKey(scanned, match),
  );
  const references = [...scanned.code.matchAll(REFERENCE)].filter(
    (match) => !inImport(scanned.code, match.index),
  );
  return [...calls, ...references].map(({ index }) => ({
    rule: CONFIGURATION_READ_RULE,
    offset: index,
  }));
}

export const kotlinSourceRules = { messages: CONFIGURATION_MESSAGES, main: [configurationReads] };
