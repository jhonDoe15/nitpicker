import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter as untypedCreateIdentityCounter } from '../../../../shared/ingest/common.mjs';
import { exceptionHint as untypedExceptionHint } from '../../../../shared/rules/exceptions.mjs';
import {
  sourceFileOf as untypedSourceFileOf,
  sourceLocator as untypedSourceLocator,
} from '../reporting/kotlin-reports.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import {
  fieldOf,
  numberOr,
  parseJson,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';
import { callUntyped, type JavaFinding } from '../typed/java-values.mts';
import { EFFECTS_MESSAGES } from './effects-messages.mts';
import { reportOf, type EffectsReport, type LocatedFact } from './effects-types.mts';

type Locator = (packageDirectory: string, fileName: string) => string | undefined;
type Resolve = (className: string, fileName: string | undefined) => string | undefined;
type Spans = Map<string, { first: number; last: number }[]>;
type EffectsContext = {
  readonly manifest: { readonly effects?: unknown; readonly kotlinSourceRoots?: unknown };
  readonly projectRoot: string;
  readonly sourceRoots: readonly string[];
  readonly reportRoot: string;
  readonly kotlin: boolean;
};

const createIdentityCounter: () => (key: string) => string = untypedCreateIdentityCounter;
const exceptionHint: (rule: string, file: string) => string = untypedExceptionHint;
const sourceLocator: (projectRoot: string, sourceRoots: readonly string[]) => Locator =
  untypedSourceLocator;
const sourceFileOf: (
  locate: Locator,
  className: string,
  fileName: string | undefined,
) => string | undefined = untypedSourceFileOf;
const messageFor: Readonly<Record<string, unknown>> = EFFECTS_MESSAGES;

const EFFECTS_REPORT = 'effects.json';
const EFFECTS_TOOL = 'effects';
const LOOP_RULE = 'IoCallInLoop';
const REACTIVE_RULE = 'ReactiveLookupPerElement';
const REACTIVE_FAN_OUT_RULES = new Set(['UnboundedReactiveFanOut']);
const LOOP_RULES = new Set([
  LOOP_RULE,
  'SpringDataNoSaveInLoop',
  'SpringDataBatchOfOne',
  'SpringDataRowWriteInLoop',
  'SpringDataSaveInLoopHelper',
  'SpringDataNoFlush',
]);

function languageOf(file: string): string {
  return file.endsWith('.kt') ? 'kotlin' : 'java';
}

const SKIPPED_RULE = 'effects-skipped-classes';
const DEGRADED_RULE = 'effects-degraded';
const CLASSPATH_RULE = 'effects-classpath-incomplete';
const UNAVAILABLE_RULE = 'effects-unavailable';
const MIN_UNRESOLVED = 3;
const UNRESOLVED_SHARE = 10;

function notice(rule: string, message: string): Finding[] {
  return [
    { tool: EFFECTS_TOOL, rule, path: '.', identity: rule, message, classification: 'descriptive' },
  ];
}

function skippedNotice({ skipped, unreadableLibraries }: EffectsReport): Finding[] {
  if (skipped === 0 && unreadableLibraries === 0) {
    return [];
  }
  return notice(
    SKIPPED_RULE,
    [
      `The effects engine could not read ${String(skipped)} class files of this module and`,
      `${String(unreadableLibraries)} library classes, so its rules did not check that code; class files`,
      "newer than the engine's ASM release are the usual cause: build with a JDK that ASM reads, or raise",
      'the pinned ASM version.',
    ].join(' '),
  );
}

function degradedNotice({ degraded }: EffectsReport): Finding[] {
  const { oversizedMethods, timeBudgetExceeded } = degraded;
  if (oversizedMethods === 0 && !timeBudgetExceeded) {
    return [];
  }
  const reasons = [
    oversizedMethods === 0 ? undefined : `${String(oversizedMethods)} methods too large to analyze`,
    timeBudgetExceeded ? 'the time budget ran out' : undefined,
  ].filter((reason) => reason !== undefined);
  return notice(
    DEGRADED_RULE,
    `The effects engine skipped part of this module (${reasons.join(' and ')}), so its rules did not check that code; split the large methods, or set the effects option timeBudgetSeconds higher.`,
  );
}

function classpathNotice({ unresolved }: EffectsReport): Finding[] {
  const { supertypes, total } = unresolved;
  if (supertypes < MIN_UNRESOLVED || supertypes * UNRESOLVED_SHARE < total) {
    return [];
  }
  return notice(
    CLASSPATH_RULE,
    `The effects engine could not find ${String(supertypes)} of the ${String(total)} parent types of this module's classes on its classpath, so it may miss clients and entities behind them; make the module's compile classpath complete (run the build that resolves its dependencies).`,
  );
}

function unavailableNotice({ unavailable }: EffectsReport): Finding[] {
  return unavailable === undefined ? [] : notice(UNAVAILABLE_RULE, unavailable);
}

function noticesOf(report: EffectsReport): Finding[] {
  return [
    ...skippedNotice(report),
    ...degradedNotice(report),
    ...classpathNotice(report),
    ...unavailableNotice(report),
  ];
}

function requireReadableClasses({ classes, skipped }: EffectsReport): void {
  if (classes === 0 && skipped > 0) {
    throw new Error(
      `The effects engine could not read any of the ${String(skipped)} class files of the module, so it checked nothing; class files newer than the engine's ASM release are the usual cause: build with a JDK that ASM reads, or raise the pinned ASM version`,
    );
  }
}

function readReport(reportRoot: string): EffectsReport {
  const file = path.join(reportRoot, EFFECTS_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The effects report ${EFFECTS_REPORT} is missing`);
  }
  const report = reportOf(parseJson(readFileSync(file, 'utf8')));
  requireReadableClasses(report);
  return report;
}

function locatedFacts(
  covered: EffectsReport['covered'],
  resolve: (className: string, fileName: string) => string | undefined,
): LocatedFact[] {
  return covered.flatMap((fact) => {
    const filePath = resolve(fact.className, fact.fileName);
    return filePath === undefined ? [] : [{ ...fact, path: filePath }];
  });
}

export function readEffectsReport(
  reportRoot: string,
  { resolvePath, kotlin = false }: { resolvePath: Resolve; kotlin?: true | false },
): { findings: Finding[]; covered: LocatedFact[] } {
  const report = readReport(reportRoot);
  function resolve(className: string, fileName: string): string | undefined {
    const filePath = resolvePath(className, fileName === '' ? undefined : fileName);
    return filePath === undefined || (!kotlin && filePath.endsWith('.kt')) ? undefined : filePath;
  }
  const counters = new Map<string, (key: string) => string>();
  const findings = report.violations.flatMap((violation) => {
    const { rule, className, fileName, line, firstLine, detail } = violation;
    const describe = messageFor[rule];
    if (describe === undefined) {
      throw new Error(`Unknown effects rule ${rule} in ${EFFECTS_REPORT}`);
    }
    const filePath = resolve(className, fileName);
    if (filePath === undefined) {
      return [];
    }
    const unique = counters.get(filePath) ?? createIdentityCounter();
    counters.set(filePath, unique);
    const message = textOf(callUntyped(describe, violation.raw, languageOf(filePath)));
    return [
      {
        tool: EFFECTS_TOOL,
        rule,
        path: filePath,
        identity: unique(`${rule}:${detail}`),
        message: `${message} ${exceptionHint(`${EFFECTS_TOOL}/${rule}`, filePath)}`,
        classification: 'enforceable',
        location: { line },
        firstLine,
      },
    ];
  });
  return {
    findings: [...findings, ...noticesOf(report)],
    covered: locatedFacts(report.covered, resolve),
  };
}

function withoutFirstLine<Subject extends JavaFinding>(finding: Subject): Subject {
  const kept = { ...finding };
  Reflect.deleteProperty(kept, 'firstLine');
  return kept;
}

export function readEffectsFindings(
  reportRoot: string,
  options: { resolvePath: Resolve; kotlin?: true | false },
): Finding[] {
  return readEffectsReport(reportRoot, options).findings.map(withoutFirstLine);
}

function spanOf(source: object): { first: number; last: number } {
  const last = numberOr(
    fieldOf(fieldOf(source, 'location'), 'line'),
    numberOr(fieldOf(source, 'line'), 0),
  );
  return { first: Math.min(numberOr(fieldOf(source, 'firstLine'), last), last), last };
}

function within(spans: Spans, file: string, line: number): boolean {
  return (spans.get(file) ?? []).some(({ first, last }) => first <= line && line <= last);
}

function spansBy(entries: readonly (JavaFinding | LocatedFact)[]): Spans {
  const spans: Spans = new Map();
  for (const entry of entries) {
    spans.set(entry.path, [...(spans.get(entry.path) ?? []), spanOf(entry)]);
  }
  return spans;
}

function linesOf(
  findings: readonly JavaFinding[],
  rules: ReadonlySet<string>,
): Map<string, number[]> {
  const lines = new Map<string, number[]>();
  for (const { tool, rule, path: file, location } of findings) {
    if (tool !== EFFECTS_TOOL && rules.has(rule) && location?.line !== undefined) {
      lines.set(file, [...(lines.get(file) ?? []), location.line]);
    }
  }
  return lines;
}

function coveredByOtherTool(finding: JavaFinding, lines: Map<string, number[]>): boolean {
  const { first, last } = spanOf(finding);
  return (lines.get(finding.path) ?? []).some((line) => first <= line && line <= last);
}

export function withoutCoveredLines(
  findings: readonly JavaFinding[],
  covered: readonly LocatedFact[] = [],
): JavaFinding[] {
  const loopLines = linesOf(findings, LOOP_RULES);
  const effects = findings.filter(
    (finding) => finding.tool === EFFECTS_TOOL && finding.rule === LOOP_RULE,
  );
  const reactiveLines = linesOf(findings, REACTIVE_FAN_OUT_RULES);
  const exempt = spansBy(covered.filter(({ verdict }) => verdict === 'exempt'));
  const kept = spansBy([...covered.filter(({ verdict }) => verdict === 'owned'), ...effects]);
  return findings
    .filter((finding) => {
      if (finding.tool === EFFECTS_TOOL) {
        if (finding.rule === REACTIVE_RULE) {
          return !coveredByOtherTool(finding, reactiveLines);
        }
        return finding.rule !== LOOP_RULE || !coveredByOtherTool(finding, loopLines);
      }
      const line = finding.location?.line;
      return (
        finding.rule !== LOOP_RULE ||
        line === undefined ||
        !within(exempt, finding.path, line) ||
        within(kept, finding.path, line)
      );
    })
    .map(withoutFirstLine);
}

export function withEffectsFindings(
  context: EffectsContext,
  findings: readonly JavaFinding[],
): readonly JavaFinding[] {
  if (context.manifest.effects !== true) {
    return findings;
  }
  const { projectRoot, sourceRoots, manifest } = context;
  const locate = sourceLocator(projectRoot, [
    ...sourceRoots,
    ...(context.kotlin ? textsOf(manifest.kotlinSourceRoots) : []),
  ]);
  const effects = readEffectsReport(context.reportRoot, {
    resolvePath: (className: string, fileName: string | undefined) =>
      sourceFileOf(locate, className, fileName),
    kotlin: context.kotlin,
  });
  return withoutCoveredLines([...findings, ...effects.findings], effects.covered);
}
