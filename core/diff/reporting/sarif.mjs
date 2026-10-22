import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { comparisonKey } from '../comparison/fingerprint.mjs';
import { heldFindingsOf } from './report-model.mjs';

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';

const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

const SOURCE_ROOT_ID = '%SRCROOT%';

function sourceRootUri(projectRoot) {
  return `${pathToFileURL(projectRoot).href.replace(/\/$/u, '')}/`;
}

function encodePath(findingPath) {
  return findingPath.split('/').map(encodeURIComponent).join('/');
}

function toSarifResult({ finding, baselineState }, projectRoot) {
  const artifactLocation = {
    uri: encodePath(finding.path),
    ...(projectRoot === undefined ? {} : { uriBaseId: SOURCE_ROOT_ID }),
  };
  const physicalLocation = { artifactLocation };
  if (finding.location !== undefined) {
    physicalLocation.region = {
      startLine: finding.location.line,
      ...(finding.location.column === undefined ? {} : { startColumn: finding.location.column }),
    };
  }
  return {
    ruleId: `${finding.tool}/${finding.rule}`,
    level: finding.classification === 'enforceable' ? 'error' : 'note',
    ...(baselineState === undefined ? {} : { baselineState }),
    message: { text: finding.message },
    locations: [{ physicalLocation }],
    partialFingerprints: {
      [SARIF_FINGERPRINT_KEY]: createHash('sha256').update(comparisonKey(finding)).digest('hex'),
    },
  };
}

function collectSarifRules(findings) {
  const rules = new Map();
  for (const finding of findings) {
    const ruleId = `${finding.tool}/${finding.rule}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, { id: ruleId, name: finding.rule });
    }
  }
  return [...rules.values()];
}

function renderSarifLog({ entries, toolErrors, projectRoot }) {
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'nitpicker',
            informationUri: 'https://github.com/jhonDoe15/nitpicker',
            rules: collectSarifRules(entries.map(({ finding }) => finding)),
          },
        },
        ...(projectRoot === undefined
          ? {}
          : { originalUriBaseIds: { [SOURCE_ROOT_ID]: { uri: sourceRootUri(projectRoot) } } }),
        invocations: [
          {
            executionSuccessful: toolErrors.length === 0,
            toolExecutionNotifications: toolErrors.map((error) => ({
              level: 'error',
              message: { text: `${error.tool} (${error.snapshot}): ${error.message}` },
            })),
          },
        ],
        results: entries.map((entry) => toSarifResult(entry, projectRoot)),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

export function renderSarifReport(report, { projectRoot } = {}) {
  return renderSarifLog({
    entries: [
      ...report.newFindings.map((finding) => ({ finding, baselineState: 'new' })),
      ...heldFindingsOf(report).map((finding) => ({ finding, baselineState: 'unchanged' })),
    ],
    toolErrors: report.toolErrors,
    projectRoot,
  });
}

export function renderSnapshotSarifReport(report, { projectRoot } = {}) {
  return renderSarifLog({
    entries: report.findings.map((finding) => ({ finding })),
    toolErrors: report.toolErrors,
    projectRoot,
  });
}
