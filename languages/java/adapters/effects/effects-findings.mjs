import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { sourceFileOf, sourceLocator } from '../reporting/kotlin-reports.mjs';
import { EFFECTS_MESSAGES } from './effects-messages.mjs';

const EFFECTS_REPORT = 'effects.json';
const EFFECTS_TOOL = 'effects';
const LOOP_RULE = 'IoCallInLoop';
const LOOP_RULES = new Set([
  LOOP_RULE,
  'SpringDataNoSaveInLoop',
  'SpringDataBatchOfOne',
  'SpringDataRowWriteInLoop',
  'SpringDataSaveInLoopHelper',
  'SpringDataNoFlush',
]);

function languageOf(file) {
  return file.endsWith('.kt') ? 'kotlin' : 'java';
}

const SKIPPED_RULE = 'effects-skipped-classes';

function skippedNotice({ skipped = 0, unreadableLibraries = 0 }) {
  if (skipped === 0 && unreadableLibraries === 0) {
    return [];
  }
  return [
    {
      tool: EFFECTS_TOOL,
      rule: SKIPPED_RULE,
      path: '.',
      identity: SKIPPED_RULE,
      message: [
        `The effects engine could not read ${String(skipped)} class files of this module and`,
        `${String(unreadableLibraries)} library classes, so its rules did not check that code; class files`,
        "newer than the engine's ASM release are the usual cause: build with a JDK that ASM reads, or raise",
        'the pinned ASM version.',
      ].join(' '),
      classification: 'descriptive',
    },
  ];
}

function requireReadableClasses({ classes, skipped = 0 }) {
  if (classes === 0 && skipped > 0) {
    throw new Error(
      `The effects engine could not read any of the ${String(skipped)} class files of the module, so it checked nothing; class files newer than the engine's ASM release are the usual cause: build with a JDK that ASM reads, or raise the pinned ASM version`,
    );
  }
}

function readReport(reportRoot) {
  const file = path.join(reportRoot, EFFECTS_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The effects report ${EFFECTS_REPORT} is missing`);
  }
  const report = JSON.parse(readFileSync(file, 'utf8'));
  requireReadableClasses(report);
  return report;
}

function locatedFacts(covered, resolve) {
  return covered.flatMap((fact) => {
    const filePath = resolve(fact.className, fact.fileName);
    return filePath === undefined ? [] : [{ ...fact, path: filePath }];
  });
}

export function readEffectsReport(reportRoot, { resolvePath, kotlin = false }) {
  const report = readReport(reportRoot);
  function resolve(className, fileName) {
    const filePath = resolvePath(className, fileName === '' ? undefined : fileName);
    return filePath === undefined || (!kotlin && filePath.endsWith('.kt')) ? undefined : filePath;
  }
  const counters = new Map();
  const findings = report.violations.flatMap((violation) => {
    const { rule, className, fileName, line, firstLine = line, detail } = violation;
    const describe = EFFECTS_MESSAGES[rule];
    if (describe === undefined) {
      throw new Error(`Unknown effects rule ${rule} in ${EFFECTS_REPORT}`);
    }
    const filePath = resolve(className, fileName);
    if (filePath === undefined) {
      return [];
    }
    const unique = counters.get(filePath) ?? createIdentityCounter();
    counters.set(filePath, unique);
    const message = describe(violation, languageOf(filePath));
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
    findings: [...findings, ...skippedNotice(report)],
    covered: locatedFacts(report.covered ?? [], resolve),
  };
}

function withoutFirstLine(finding) {
  const kept = { ...finding };
  delete kept.firstLine;
  return kept;
}

export function readEffectsFindings(reportRoot, options) {
  return readEffectsReport(reportRoot, options).findings.map(withoutFirstLine);
}

function spanOf({ location, line, firstLine }) {
  const last = location?.line ?? line ?? 0;
  return { first: Math.min(firstLine ?? last, last), last };
}

function within(spans, file, line) {
  return (spans.get(file) ?? []).some(({ first, last }) => first <= line && line <= last);
}

function spansBy(entries) {
  const spans = new Map();
  for (const entry of entries) {
    spans.set(entry.path, [...(spans.get(entry.path) ?? []), spanOf(entry)]);
  }
  return spans;
}

function linesOf(findings, rules) {
  const lines = new Map();
  for (const { tool, rule, path: file, location } of findings) {
    if (tool !== EFFECTS_TOOL && rules.has(rule) && location?.line !== undefined) {
      lines.set(file, [...(lines.get(file) ?? []), location.line]);
    }
  }
  return lines;
}

function coveredByOtherTool(finding, lines) {
  const { first, last } = spanOf(finding);
  return (lines.get(finding.path) ?? []).some((line) => first <= line && line <= last);
}

export function withoutCoveredLines(findings, covered = []) {
  const loopLines = linesOf(findings, LOOP_RULES);
  const effects = findings.filter(
    (finding) => finding.tool === EFFECTS_TOOL && finding.rule === LOOP_RULE,
  );
  const exempt = spansBy(covered.filter(({ verdict }) => verdict === 'exempt'));
  const kept = spansBy([...covered.filter(({ verdict }) => verdict === 'owned'), ...effects]);
  return findings
    .filter((finding) => {
      if (finding.tool === EFFECTS_TOOL) {
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

export function withEffectsFindings(context, findings) {
  if (context.manifest.effects !== true) {
    return findings;
  }
  const { projectRoot, sourceRoots, manifest } = context;
  const locate = sourceLocator(projectRoot, [
    ...sourceRoots,
    ...(context.kotlin ? (manifest.kotlinSourceRoots ?? []) : []),
  ]);
  const effects = readEffectsReport(context.reportRoot, {
    resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
    kotlin: context.kotlin,
  });
  return withoutCoveredLines([...findings, ...effects.findings], effects.covered);
}
