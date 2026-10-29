import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { hash, nextOccurrence } from '../../../../../shared/rules/finding-helpers.mjs';
import { lineOf, lineText, scanKotlinSource } from './kotlin-source.mjs';
import { REPEATED_STRING_MESSAGE, repeatedStringLiterals } from './literals/repeated-strings.mjs';
import {
  CALL_MESSAGES,
  ioInLoops,
  logTemplates,
  shellCommands,
  standardStreams,
} from './rules/calls.mjs';
import { CATCH_MESSAGES, booleanFlags, catchOnlyLogs } from './rules/catches.mjs';
import { DECLARATION_MESSAGES, genericNames, mutableModuleState } from './rules/declarations.mjs';
import {
  MARKER_MESSAGES,
  annotationMarkers,
  commentedOutCode,
  generatedFile,
} from './rules/markers.mjs';
import {
  SECRET_MESSAGES,
  credentialLiterals,
  hardcodedSecrets,
  secretsInLogs,
} from './rules/secrets.mjs';
import { TEST_MESSAGES, testClassesWithoutTests, testHelpersInSource } from './rules/tests.mjs';
import { CLIENT_MESSAGES, httpWithoutTimeout, unsafeDeserialization } from './security/clients.mjs';
import { CRYPTO_MESSAGES, disabledTlsVerification, weakHashes } from './security/crypto.mjs';
import { SQL_MESSAGES, sqlStringBuilding } from './security/sql.mjs';
import { kotlinDeclarations } from './security/sql-values.mjs';

const KOTLIN_SOURCE_TOOL = 'kotlin-source';

const MESSAGES = {
  ...MARKER_MESSAGES,
  ...DECLARATION_MESSAGES,
  ...CALL_MESSAGES,
  ...CATCH_MESSAGES,
  ...SECRET_MESSAGES,
  ...TEST_MESSAGES,
  ...SQL_MESSAGES,
  ...CRYPTO_MESSAGES,
  ...CLIENT_MESSAGES,
  RepeatedStringLiteral: REPEATED_STRING_MESSAGE,
};

export const KOTLIN_SOURCE_RULES = Object.keys(MESSAGES).map(
  (rule) => `${KOTLIN_SOURCE_TOOL}/${rule}`,
);

const MAIN_RULES = [
  annotationMarkers,
  commentedOutCode,
  mutableModuleState,
  genericNames,
  logTemplates,
  shellCommands,
  ioInLoops,
  standardStreams,
  catchOnlyLogs,
  booleanFlags,
  hardcodedSecrets,
  credentialLiterals,
  secretsInLogs,
  testHelpersInSource,
  sqlStringBuilding,
  weakHashes,
  disabledTlsVerification,
  httpWithoutTimeout,
  unsafeDeserialization,
  repeatedStringLiterals,
];
const TEST_RULES = [testClassesWithoutTests];

function kotlinFiles(projectRoot, sourceRoots) {
  const files = sourceRoots.flatMap((sourceRoot) => {
    const directory = pathInside(projectRoot, sourceRoot);
    if (directory === undefined || !existsSync(directory)) {
      return [];
    }
    return readdirSync(directory, { recursive: true })
      .filter((entry) => entry.endsWith('.kt'))
      .map((entry) => ({
        file: path.posix.join(sourceRoot, entry.replaceAll('\\', '/')),
        absolute: path.join(directory, entry),
      }));
  });
  const byFile = new Map(files.map((entry) => [entry.file, entry]));
  return [...byFile.values()].toSorted((left, right) => (left.file < right.file ? -1 : 1));
}

function finding({ file, scanned, occurrences }, reported) {
  const line = lineOf(scanned, reported.offset);
  const subject = reported.subject ?? lineText(scanned, line).trim().replaceAll(/\s+/g, ' ');
  const key = `${reported.rule}\0${subject}`;
  const occurrence = nextOccurrence(occurrences, key);
  return {
    tool: KOTLIN_SOURCE_TOOL,
    rule: reported.rule,
    path: file,
    identity: `${reported.rule}:${hash(subject)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
    message: reported.message ?? MESSAGES[reported.rule],
    classification: 'enforceable',
    location: { line },
  };
}

function scannedFiles(projectRoot, sourceRoots) {
  return kotlinFiles(projectRoot, sourceRoots)
    .map(({ file, absolute }) => ({
      file,
      scanned: scanKotlinSource(readFileSync(absolute, 'utf8')),
    }))
    .filter(({ scanned }) => !generatedFile(scanned));
}

function scanFiles(files, rules) {
  const context = { declarations: kotlinDeclarations(files.map(({ scanned }) => scanned)) };
  return files.flatMap(({ file, scanned }) => {
    const occurrences = new Map();
    return rules
      .flatMap((rule) => rule(scanned, context))
      .toSorted((left, right) => left.offset - right.offset)
      .map((reported) => finding({ file, scanned, occurrences }, reported));
  });
}

export function readKotlinSourceFindings(projectRoot, manifest) {
  return [
    ...scanFiles(scannedFiles(projectRoot, manifest.kotlinSourceRoots ?? []), MAIN_RULES),
    ...scanFiles(scannedFiles(projectRoot, manifest.kotlinTestSourceRoots ?? []), TEST_RULES),
  ];
}
