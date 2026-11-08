import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { listEntriesOf, MERGED_LISTS } from '../detekt/detekt-lists.mjs';
import { ONE_WAY_RULES } from '../rules/kotlin-rules.mjs';
import { isCompositionRoot, lineText, scanKotlinSource } from './kotlin-source.mjs';
import { hasCallbackAnnotation, UNUSED_PARAMETER_RULE } from './parameters/declaration-header.mjs';

const FORBIDDEN_CALL = 'detekt.style.ForbiddenMethodCall';
const SPREAD = 'detekt.performance.SpreadOperator';
const ENVIRONMENT = '`java.lang.System.getenv`';
const SPRING_ENTRY = /\brunApplication\s*<|\bSpringApplication\s*\.\s*run\s*\(/;
const NAMED = /^The (?:method|import) `([^`]+)`/;
const IN_TESTS_TOO = new Set([
  'kotlin.run',
  'kotlin.with',
  'kotlin.also',
  'kotlinx.coroutines.runBlocking',
  'kotlin.io.print',
  'kotlin.io.println',
]);
const NITPICKER_DETEKT = path.resolve(import.meta.dirname, '../../../detekt/nitpicker-detekt.yml');

function mainOnlyNames() {
  const text = readFileSync(NITPICKER_DETEKT, 'utf8');
  const lists = MERGED_LISTS.filter(({ rule }) => /^Forbidden(?:MethodCall|Import)$/.test(rule));
  return new Map(
    lists.map((list) => [
      `detekt.${list.ruleset}.${list.rule}`,
      new Set(
        listEntriesOf(text, list)
          .map(({ value }) => value)
          .filter((value) => !IN_TESTS_TOO.has(value)),
      ),
    ]),
  );
}

const MAIN_ONLY = mainOnlyNames();
const MAIN_ONLY_RULES = new Set(
  ONE_WAY_RULES.filter(({ mainOnly }) => mainOnly).map(({ id }) => id),
);

function isMainOnly(finding) {
  const name = NAMED.exec(finding.message)?.[1];
  return (
    MAIN_ONLY_RULES.has(finding.rule) ||
    (name !== undefined && MAIN_ONLY.get(finding.rule)?.has(name) === true)
  );
}

function isMainOnlyInTest(finding, testRoots) {
  return isMainOnly(finding) && testRoots.some((root) => finding.path.startsWith(`${root}/`));
}

function sourceReader(projectRoot) {
  const scans = new Map();
  return (file) => {
    if (!scans.has(file)) {
      const absolute = pathInside(projectRoot, file);
      const exists = absolute !== undefined && existsSync(absolute);
      scans.set(file, exists ? scanKotlinSource(readFileSync(absolute, 'utf8')) : undefined);
    }
    return scans.get(file);
  };
}

function isAllowed(finding, source, spring) {
  if (finding.rule === FORBIDDEN_CALL && finding.message.includes(ENVIRONMENT)) {
    const scanned = source(finding.path);
    return scanned !== undefined && isCompositionRoot(scanned);
  }
  if (finding.rule === UNUSED_PARAMETER_RULE && finding.location?.line !== undefined) {
    const scanned = source(finding.path);
    return scanned !== undefined && hasCallbackAnnotation(scanned, finding.location.line);
  }
  if (spring && finding.rule === SPREAD && finding.location?.line !== undefined) {
    const scanned = source(finding.path);
    return scanned !== undefined && SPRING_ENTRY.test(lineText(scanned, finding.location.line));
  }
  return false;
}

export function withFrameworkAllowances(findings, { projectRoot, spring = false, testRoots = [] }) {
  const source = sourceReader(projectRoot);
  return findings.filter(
    (finding) => !isMainOnlyInTest(finding, testRoots) && !isAllowed(finding, source, spring),
  );
}
