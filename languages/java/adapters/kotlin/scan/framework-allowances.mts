import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { listEntriesOf, MERGED_LISTS } from '../detekt/detekt-lists.mts';
import { ONE_WAY_RULES } from '../rules/kotlin-rules.mts';
import { lineText, scanKotlinSource } from './kotlin-source.mts';
import type { Scanned } from './typed/scan-shapes.mts';
import { isConfigurationRoot } from './configuration/configuration-roots.mts';
import { hasCallbackAnnotation, UNUSED_PARAMETER_RULE } from './parameters/declaration-header.mts';

type FrameworkFinding = {
  rule: string;
  path: string;
  message: string;
  location?: { line?: number };
};

type AllowanceOptions = { projectRoot: string; testRoots?: string[]; spring?: true };
type SourceOf = (file: string) => Scanned | undefined;

const FORBIDDEN_CALL = 'detekt.style.ForbiddenMethodCall';
const SPREAD = 'detekt.performance.SpreadOperator';
const SLEEP_IN_SUSPEND = 'detekt.coroutines.SleepInsteadOfDelay';
const SLEEP_CALL = '`java.lang.Thread.sleep`';
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

function mainOnlyNames(): Map<string, Set<string>> {
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

function isMainOnly(finding: FrameworkFinding): boolean {
  const name = NAMED.exec(finding.message)?.[1];
  return (
    MAIN_ONLY_RULES.has(finding.rule) ||
    (name !== undefined && MAIN_ONLY.get(finding.rule)?.has(name) === true)
  );
}

function isMainOnlyInTest(finding: FrameworkFinding, testRoots: string[]): boolean {
  return isMainOnly(finding) && testRoots.some((root) => finding.path.startsWith(`${root}/`));
}

function sourceReader(projectRoot: string): SourceOf {
  const scans = new Map<string, Scanned | undefined>();
  return (file: string) => {
    if (!scans.has(file)) {
      const absolute = pathInside(projectRoot, file);
      const exists = absolute !== undefined && existsSync(absolute);
      scans.set(file, exists ? scanKotlinSource(readFileSync(absolute, 'utf8')) : undefined);
    }
    return scans.get(file);
  };
}

function isAllowed(finding: FrameworkFinding, source: SourceOf, spring: boolean): boolean {
  if (finding.rule === FORBIDDEN_CALL && finding.message.includes(ENVIRONMENT)) {
    const scanned = source(finding.path);
    return scanned !== undefined && isConfigurationRoot(scanned);
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

function lineKey(finding: FrameworkFinding): string {
  return `${finding.path}:${String(finding.location?.line)}`;
}

function sleepLinesIn(findings: FrameworkFinding[]): Set<string> {
  return new Set(findings.filter(({ rule }) => rule === SLEEP_IN_SUSPEND).map(lineKey));
}

function isRepeatedSleep(finding: FrameworkFinding, sleepLines: Set<string>): boolean {
  return (
    finding.rule === FORBIDDEN_CALL &&
    finding.message.includes(SLEEP_CALL) &&
    sleepLines.has(lineKey(finding))
  );
}

export function withFrameworkAllowances<Finding extends FrameworkFinding>(
  findings: Finding[],
  { projectRoot, spring, testRoots = [] }: AllowanceOptions,
): Finding[] {
  const source = sourceReader(projectRoot);
  const sleepLines = sleepLinesIn(findings);
  return findings.filter(
    (finding) =>
      !(
        isMainOnlyInTest(finding, testRoots) ||
        isAllowed(finding, source, spring === true) ||
        isRepeatedSleep(finding, sleepLines)
      ),
  );
}
