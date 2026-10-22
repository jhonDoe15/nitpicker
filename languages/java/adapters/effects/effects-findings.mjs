import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';
import { exceptionHint, exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { sourceFileOf, sourceLocator } from '../reporting/kotlin-reports.mjs';
import { EFFECTS_MESSAGES } from './effects-messages.mjs';

const EFFECTS_REPORT = 'effects.json';
const EFFECTS_TOOL = 'effects';
const LOOP_RULES_BY_LINE = {
  IoCallInLoop: new Set([
    'IoCallInLoop',
    'SpringDataNoSaveInLoop',
    'SpringDataBatchOfOne',
    'SpringDataRowWriteInLoop',
    'SpringDataSaveInLoopHelper',
    'SpringDataNoFlush',
  ]),
};

function languageOf(file) {
  return file.endsWith('.kt') ? 'kotlin' : 'java';
}

export function readEffectsFindings(reportRoot, { resolvePath, kotlin = false }) {
  const file = path.join(reportRoot, EFFECTS_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The effects report ${EFFECTS_REPORT} is missing`);
  }
  const { violations } = JSON.parse(readFileSync(file, 'utf8'));
  const counters = new Map();
  return violations.flatMap((violation) => {
    const { rule, className, fileName, line, detail } = violation;
    const describe = EFFECTS_MESSAGES[rule];
    if (describe === undefined) {
      throw new Error(`Unknown effects rule ${rule} in ${EFFECTS_REPORT}`);
    }
    const filePath = resolvePath(className, fileName === '' ? undefined : fileName);
    if (filePath === undefined || (!kotlin && filePath.endsWith('.kt'))) {
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
      },
    ];
  });
}

function lineKey(rule, file, line) {
  return `${rule}\0${file}\0${String(line)}`;
}

export function withoutCoveredLines(findings, { exceptions = [], modulePath } = {}) {
  const lifted = exceptionMatcher(exceptions);
  const reported = new Set(
    findings
      .filter(
        ({ tool, rule, path: file }) =>
          tool === 'pmd' && !lifted(`${tool}/${rule}`, inModule(modulePath, file)),
      )
      .map(({ rule, path: file, location }) => lineKey(rule, file, location?.line)),
  );
  return findings.filter(
    ({ tool, rule, path: file, location }) =>
      tool !== EFFECTS_TOOL ||
      ![...(LOOP_RULES_BY_LINE[rule] ?? [])].some((covering) =>
        reported.has(lineKey(covering, file, location?.line)),
      ),
  );
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
  const effects = readEffectsFindings(context.reportRoot, {
    resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
    kotlin: context.kotlin,
  });
  return withoutCoveredLines([...findings, ...effects], {
    exceptions: context.classLimits?.exceptions,
    modulePath: context.classLimits?.modulePath,
  });
}
