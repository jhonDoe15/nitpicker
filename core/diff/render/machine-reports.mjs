import { createHash } from 'node:crypto';
import { comparisonKey } from '../fingerprint.mjs';
import { escapeXml, singleLine } from './text-format.mjs';

function passedCase(name, seconds) {
  return `  <testcase classname="quality.diff" name="${escapeXml(name)}" time="${seconds}"></testcase>`;
}

function failedCase({ classname, name, summary, type, message }) {
  const typeAttribute = type === undefined ? '' : ` type="${escapeXml(type)}"`;
  const failure = `<failure message="${escapeXml(summary)}"${typeAttribute}>${escapeXml(message)}</failure>`;
  return `  <testcase classname="${classname}" name="${escapeXml(name)}" time="0">${failure}</testcase>`;
}

function findingCase(finding) {
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  return failedCase({
    classname: 'quality.diff.new-findings',
    name: `${finding.tool}/${finding.rule} ${finding.path}${location}`,
    summary: singleLine(finding.message),
    type: `${finding.tool}/${finding.rule}`,
    message: finding.message,
  });
}

function toolErrorCase(error) {
  return failedCase({
    classname: 'quality.diff',
    name: `${error.tool}:${error.snapshot}`,
    summary: error.message,
    message: error.message,
  });
}

export function renderJunitReport(report) {
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const testCases = [
    ...report.summary.tools.map((tool) =>
      passedCase(tool.name, ((tool.elapsedMs ?? 0) / 1000).toFixed(3)),
    ),
    ...violations.map((finding) => findingCase(finding)),
    ...report.toolErrors.map((error) => toolErrorCase(error)),
  ];
  if (testCases.length === 0) {
    testCases.push(passedCase('framework', '0'));
  }
  const failures = String(violations.length + report.toolErrors.length);
  const seconds = (report.summary.elapsedMs / 1000).toFixed(3);
  const tests = String(testCases.length);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" tests="${tests}" failures="${failures}" errors="0" time="${seconds}">`,
    ...testCases,
    '</testsuite>',
    '',
  ].join('\n');
}

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

function sarifResult(finding, rules) {
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
}

function sarifRun(report, rules, results) {
  return {
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
  };
}

export function renderSarifReport(report) {
  const rules = new Map();
  const results = report.newFindings.map((finding) => sarifResult(finding, rules));
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [sarifRun(report, rules, results)],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
