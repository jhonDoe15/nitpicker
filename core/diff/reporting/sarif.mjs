import { createHash } from 'node:crypto';
import { comparisonKey } from '../comparison/fingerprint.mjs';
import {
  entryForFinding,
  readReferenceIndex,
  referenceUrl,
} from '../../../shared/reference/store.mjs';

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';

const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

function toSarifResult(finding) {
  const physicalLocation = { artifactLocation: { uri: finding.path } };
  if (finding.location !== undefined) {
    physicalLocation.region = {
      startLine: finding.location.line,
      ...(finding.location.column === undefined ? {} : { startColumn: finding.location.column }),
    };
  }
  return {
    ruleId: `${finding.tool}/${finding.rule}`,
    level: finding.classification === 'enforceable' ? 'error' : 'note',
    message: { text: finding.message },
    locations: [{ physicalLocation }],
    partialFingerprints: {
      [SARIF_FINGERPRINT_KEY]: createHash('sha256').update(comparisonKey(finding)).digest('hex'),
    },
  };
}

function sarifRule(finding, index) {
  const entry = index === undefined ? undefined : entryForFinding(index, finding);
  return {
    id: `${finding.tool}/${finding.rule}`,
    name: finding.rule,
    ...(entry === undefined
      ? {}
      : { shortDescription: { text: entry.summary }, helpUri: referenceUrl(entry) }),
  };
}

function collectSarifRules(findings) {
  const index = findings.length === 0 ? undefined : readReferenceIndex();
  const rules = new Map();
  for (const finding of findings) {
    const ruleId = `${finding.tool}/${finding.rule}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, sarifRule(finding, index));
    }
  }
  return [...rules.values()];
}

export function renderSarifReport(report) {
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'nitpicker',
            informationUri: 'https://github.com/jhonDoe15/nitpicker',
            rules: collectSarifRules(report.newFindings),
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
        results: report.newFindings.map(toSarifResult),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
