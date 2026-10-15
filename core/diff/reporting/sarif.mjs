import { createHash } from 'node:crypto';
import { comparisonKey } from '../comparison/fingerprint.mjs';

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
