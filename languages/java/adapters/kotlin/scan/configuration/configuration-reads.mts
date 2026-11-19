import { CONFIGURATION_READ_RULE } from '../../../spring/configuration/covered-reads.mts';
import { inImport, literalAt, splitArguments } from '../kotlin-source.mts';
import { isConfigurationRoot } from './configuration-roots.mts';
import { escapeRegExp } from '../../../typed/regex-escape.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

const READS = [
  'System\\s*\\.\\s*getProperty',
  'Integer\\s*\\.\\s*getInteger',
  'Long\\s*\\.\\s*getLong',
  'Boolean\\s*\\.\\s*getBoolean',
];
const READ = new RegExp(
  `(?<![\\w.])(?:java\\s*\\.\\s*lang\\s*\\.\\s*)?(?:${READS.join('|')})\\s*\\(`,
  'gu',
);
const REFERENCE = /(?<![\w.])(?:java\s*\.\s*lang\s*\.\s*)?System\s*::\s*getProperty\b/gu;
const READER_TYPES = '(System|Integer|Long|Boolean)';
const READER_MEMBERS = '(?:\\s*\\.\\s*(getProperty|getInteger|getLong|getBoolean))?';
const READER_IMPORT = new RegExp(
  `^[ \\t]*import\\s+java\\s*\\.\\s*lang\\s*\\.\\s*${READER_TYPES}${READER_MEMBERS}(?:\\s+as\\s+(\\w+))?[ \\t]*$`,
  'gmu',
);
const JVM_KEY = /^(?:java|user|os|file|line|path|javax|jdk|sun|com\.sun|http|https|ftp)\.|^socks/u;
const CONFIGURATION_MESSAGES = {
  [CONFIGURATION_READ_RULE]:
    'Read environment variables and system properties once in the composition root (the file with `fun main`, a Ktor `Application` module, a Guice or Dagger module, a CDI or Micronaut factory) or through the typed configuration of the framework, and pass the values in through constructors or parameters, not `System.getProperty`, `Integer.getInteger`, `java.lang.Long.getLong` or `java.lang.Boolean.getBoolean`. JVM properties such as `java.*`, `user.*`, `javax.*`, `jdk.*` and `http.*` are fine. A library reading its own opt-in switch (`-Dmylib.debug`) takes an exception.',
};

function readsJvmKey(scanned: Scanned, match: RegExpExecArray) {
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

function readerOf(type: string): string | undefined {
  return new Map([
    ['System', 'getProperty'],
    ['Integer', 'getInteger'],
    ['Long', 'getLong'],
    ['Boolean', 'getBoolean'],
  ]).get(type);
}

function importedReaders(code: string): { calls: RegExp[]; references: RegExp[] } {
  const calls: RegExp[] = [];
  const references: RegExp[] = [];
  for (const [, type = '', member, alias] of code.matchAll(READER_IMPORT)) {
    const reader = readerOf(type);
    if (reader === undefined) {
      continue;
    }
    if (member !== undefined && member === reader) {
      const name = escapeRegExp(alias ?? member);
      calls.push(new RegExp(`(?<![\\w.])${name}\\s*\\(`, 'gu'));
      references.push(new RegExp(`(?<![\\w.])::\\s*${name}\\b`, 'gu'));
    } else if (member === undefined && alias !== undefined) {
      const owner = escapeRegExp(alias);
      const method = escapeRegExp(reader);
      calls.push(new RegExp(`(?<![\\w.])${owner}\\s*\\.\\s*${method}\\s*\\(`, 'gu'));
      references.push(new RegExp(`(?<![\\w.])${owner}\\s*::\\s*${method}\\b`, 'gu'));
    }
  }
  return { calls, references };
}

export function configurationReads(scanned: Scanned): { rule: string; offset: number }[] {
  if (isConfigurationRoot(scanned)) {
    return [];
  }
  const imported = importedReaders(scanned.code);
  const calls = [READ, ...imported.calls]
    .flatMap((pattern) => [...scanned.code.matchAll(pattern)])
    .filter((match) => !(inImport(scanned.code, match.index) || readsJvmKey(scanned, match)));
  const references = [REFERENCE, ...imported.references]
    .flatMap((pattern) => [...scanned.code.matchAll(pattern)])
    .filter((match) => !inImport(scanned.code, match.index));
  return [...calls, ...references].map(({ index }) => ({
    rule: CONFIGURATION_READ_RULE,
    offset: index,
  }));
}

export const kotlinSourceRules = { messages: CONFIGURATION_MESSAGES, main: [configurationReads] };
