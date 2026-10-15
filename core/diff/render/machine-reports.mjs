import { createHash } from 'node:crypto';
import { comparisonKey } from '../fingerprint.mjs';
import { escapeXml, singleLine } from './text-format.mjs';

export function renderJunitReport(report) {
  const testCases = report.summary.tools.map(
    (tool) =>
      `  <testcase classname="quality.diff" name="${escapeXml(tool.name)}" time="${((tool.elapsedMs ?? 0) / 1000).toFixed(3)}"></testcase>`,
  );
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  for (const finding of violations) {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    const name = `${finding.tool}/${finding.rule} ${finding.path}${location}`;
    testCases.push(
      `  <testcase classname="quality.diff.new-findings" name="${escapeXml(name)}" time="0"><failure message="${escapeXml(singleLine(finding.message))}" type="${escapeXml(`${finding.tool}/${finding.rule}`)}">${escapeXml(finding.message)}</failure></testcase>`,
    );
  }
  for (const error of report.toolErrors) {
    testCases.push(
      `  <testcase classname="quality.diff" name="${escapeXml(`${error.tool}:${error.snapshot}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`,
    );
  }
  if (testCases.length === 0) {
    testCases.push('  <testcase classname="quality.diff" name="framework" time="0"></testcase>');
  }
  const failures = violations.length + report.toolErrors.length;
  const tests = testCases.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" tests="${String(tests)}" failures="${String(failures)}" errors="0" time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
    ...testCases,
    '</testsuite>',
    '',
  ].join('\n');
}

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

export function renderSarifReport(report) {
  const rules = new Map();
  const results = report.newFindings.map((finding) => {
    const ruleId = `${finding.tool}/${finding.rule}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, { id: ruleId, name: finding.rule });
    }
    const physicalLocation = { artifactLocation: { uri: finding.path } };
    if (finding.location !== undefined) {
      physicalLocation.region = {
        startLine: finding.location.line,
        ...(finding.location.column === undefined ? {} : { startColumn: finding.location.column }),
      };
    }
    return {
      ruleId,
      level: finding.classification === 'enforceable' ? 'error' : 'note',
      message: { text: finding.message },
      locations: [{ physicalLocation }],
      partialFingerprints: {
        [SARIF_FINGERPRINT_KEY]: createHash('sha256').update(comparisonKey(finding)).digest('hex'),
      },
    };
  });
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'nitpicker',
            informationUri: 'https://github.com/jhonDoe15/nitpicker',
            rules: [...rules.values()],
          },
        },
        invocations: [
          {
            executionSuccessful: report.toolErrors.length === 0,
            toolExecutionNotifications: report.toolErrors.map((error) => ({
              level: 'error',
              message: { text: `${error.tool} (${error.snapshot}): ${error.message}` },
            })),
          },
        ],
        results,
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
