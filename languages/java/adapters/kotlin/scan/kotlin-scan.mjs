import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash, nextOccurrence } from '../../../../../shared/rules/finding-helpers.mjs';
import { braceDepths, lineOf, lineText, scanKotlinSource } from './kotlin-source.mjs';
import { CALL_MESSAGES, ioInLoops, logTemplates, shellCommands } from './rules/calls.mjs';
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

const KOTLIN_SOURCE_TOOL = 'kotlin-source';

const MESSAGES = {
  ...MARKER_MESSAGES,
  ...DECLARATION_MESSAGES,
  ...CALL_MESSAGES,
  ...CATCH_MESSAGES,
  ...SECRET_MESSAGES,
  ...TEST_MESSAGES,
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
  catchOnlyLogs,
  booleanFlags,
  hardcodedSecrets,
  credentialLiterals,
  secretsInLogs,
  testHelpersInSource,
];
const TEST_RULES = [testClassesWithoutTests];

const TOP_LEVEL_MAIN = /(?<![\w.])fun\s+main\s*\(/g;
const ROOT_MARKERS = [
  /@(?:[\w.]+\.)?SpringBootApplication\b/,
  /(?<![\w.])fun\s+Application\s*\.\s*\w+\s*\(/,
];

function kotlinFiles(projectRoot, sourceRoots) {
  const files = sourceRoots.flatMap((sourceRoot) => {
    const directory = path.join(projectRoot, sourceRoot);
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory, { recursive: true })
      .filter((entry) => entry.endsWith('.kt'))
      .map((entry) => path.posix.join(sourceRoot, entry.replaceAll('\\', '/')));
  });
  return [...new Set(files)].toSorted();
}

export function isCompositionRoot(scanned) {
  const depths = braceDepths(scanned.code);
  const declaresMain = [...scanned.code.matchAll(TOP_LEVEL_MAIN)].some(
    ({ index }) => depths[index] === 0,
  );
  return declaresMain || ROOT_MARKERS.some((marker) => marker.test(scanned.code));
}

function finding(file, scanned, reported, occurrences) {
  const line = lineOf(scanned, reported.offset);
  const subject = reported.subject ?? lineText(scanned, line).trim().replaceAll(/\s+/g, ' ');
  const key = `${reported.rule}\0${subject}`;
  const occurrence = nextOccurrence(occurrences, key);
  return {
    tool: KOTLIN_SOURCE_TOOL,
    rule: reported.rule,
    path: file,
    identity: `${reported.rule}:${hash(subject)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
    message: MESSAGES[reported.rule],
    classification: 'enforceable',
    location: { line },
  };
}

function scanFiles(projectRoot, files, rules) {
  return files.flatMap((file) => {
    const scanned = scanKotlinSource(readFileSync(path.join(projectRoot, file), 'utf8'));
    if (generatedFile(scanned)) {
      return [];
    }
    const occurrences = new Map();
    return rules
      .flatMap((rule) => rule(scanned))
      .toSorted((left, right) => left.offset - right.offset)
      .map((reported) => finding(file, scanned, reported, occurrences));
  });
}

export function readKotlinSourceFindings(projectRoot, manifest) {
  return [
    ...scanFiles(
      projectRoot,
      kotlinFiles(projectRoot, manifest.kotlinSourceRoots ?? []),
      MAIN_RULES,
    ),
    ...scanFiles(
      projectRoot,
      kotlinFiles(projectRoot, manifest.kotlinTestSourceRoots ?? []),
      TEST_RULES,
    ),
  ];
}
