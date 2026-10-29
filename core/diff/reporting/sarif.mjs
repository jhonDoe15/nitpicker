import { createHash } from 'node:crypto';
import { comparisonKey } from '../comparison/fingerprint.mjs';
import { sarifRunProfile } from '../../quick/report-formats.mjs';
import { noteText } from './format/notes.mjs';
import { heldFindingsOf } from './report-model.mjs';
import { joinRepositoryPath, repositoryPath } from '../git/paths.mjs';

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';

const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

const SOURCE_ROOT_ID = '%SRCROOT%';

const COLUMN_KIND = 'utf16CodeUnits';

function encodePath(findingPath) {
  return findingPath.split('/').map(encodeURIComponent).join('/');
}

function toSarifResult({ finding, baselineState }, projectPath) {
  const artifactLocation =
    projectPath === undefined
      ? { uri: encodePath(finding.path) }
      : {
          uri: encodePath(joinRepositoryPath(repositoryPath(projectPath), finding.path)),
          uriBaseId: SOURCE_ROOT_ID,
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

function renderSarifLog({ entries, toolErrors, notes = [], projectPath, summary = {} }) {
  const profile = sarifRunProfile(summary);
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
        columnKind: COLUMN_KIND,
        invocations: [
          {
            executionSuccessful: toolErrors.length === 0,
            toolExecutionNotifications: [
              ...toolErrors.map((error) => ({
                level: 'error',
                message: { text: `${error.tool} (${error.snapshot}): ${error.message}` },
              })),
              ...notes.map((note) => ({ level: 'note', message: { text: noteText(note) } })),
              ...profile.notifications,
            ],
            ...(Object.keys(profile.properties).length === 0
              ? {}
              : { properties: profile.properties }),
          },
        ],
        results: entries.map((entry) => toSarifResult(entry, projectPath)),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

function newEntries(report) {
  return report.newFindings.map((finding) => ({ finding, baselineState: 'new' }));
}

export function renderSarifReport(report, { projectPath } = {}) {
  return renderSarifLog({
    entries: newEntries(report),
    toolErrors: report.toolErrors,
    notes: report.notes,
    projectPath,
    summary: report.summary,
  });
}

export function renderBaselineSarifReport(report, { projectPath } = {}) {
  return renderSarifLog({
    entries: [
      ...newEntries(report),
      ...heldFindingsOf(report).map((finding) => ({ finding, baselineState: 'unchanged' })),
    ],
    toolErrors: report.toolErrors,
    notes: report.notes,
    projectPath,
    summary: report.summary,
  });
}

export function renderSnapshotSarifReport(report, { projectPath } = {}) {
  return renderSarifLog({
    entries: report.findings.map((finding) => ({ finding })),
    toolErrors: report.toolErrors,
    projectPath,
    summary: report.summary,
  });
}
