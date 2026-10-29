import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { comparisonKey } from '../comparison/fingerprint.mjs';
import { noteText } from './format/notes.mjs';
import { heldFindingsOf } from './report-model.mjs';
import { joinRepositoryPath, repositoryPath } from '../git/paths.mjs';
import {
  droppedResultsText,
  renderWithinUploadLimits,
  SARIF_UPLOAD_LIMITS,
} from './sarif/sarif-limits.mjs';

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';

const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

const SOURCE_ROOT_ID = '%SRCROOT%';
const SOURCE_ROOT_DESCRIPTION = 'The root of the git repository the findings are in.';

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

function originalUriBaseIds({ projectPath, repositoryRoot }) {
  if (projectPath === undefined || repositoryRoot === undefined) {
    return {};
  }
  const uri = pathToFileURL(repositoryRoot).href.replace(/\/?$/u, '/');
  return {
    originalUriBaseIds: {
      [SOURCE_ROOT_ID]: { uri, description: { text: SOURCE_ROOT_DESCRIPTION } },
    },
  };
}

function notifications({ toolErrors, notes, dropped }) {
  return [
    ...toolErrors.map((error) => ({
      level: 'error',
      message: { text: `${error.tool} (${error.snapshot}): ${error.message}` },
    })),
    ...notes.map((note) => ({ level: 'note', message: { text: noteText(note) } })),
    ...(dropped === undefined ? [] : [{ level: 'warning', message: { text: dropped } }]),
  ];
}

function renderSarifRun({ entries, toolErrors, notes, location, dropped }) {
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
        ...originalUriBaseIds(location),
        columnKind: COLUMN_KIND,
        invocations: [
          {
            executionSuccessful: toolErrors.length === 0,
            toolExecutionNotifications: notifications({ toolErrors, notes, dropped }),
          },
        ],
        results: entries.map((entry) => toSarifResult(entry, location.projectPath)),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

function renderSarifLog({ entries, toolErrors, notes = [], location, sources, limits }) {
  return renderWithinUploadLimits(
    entries,
    (kept) =>
      renderSarifRun({
        entries: kept,
        toolErrors,
        notes,
        location,
        dropped:
          kept.length === entries.length
            ? undefined
            : droppedResultsText({ kept: kept.length, total: entries.length, sources }, limits),
      }),
    limits,
  );
}

function newEntries(report) {
  return report.newFindings.map((finding) => ({ finding, baselineState: 'new' }));
}

export function renderSarifReport(report, options = {}) {
  return renderSarifLog({
    entries: newEntries(report),
    toolErrors: report.toolErrors,
    notes: report.notes,
    location: options,
    sources: 'new-findings.json',
    limits: options.limits ?? SARIF_UPLOAD_LIMITS,
  });
}

export function renderBaselineSarifReport(report, options = {}) {
  return renderSarifLog({
    entries: [
      ...newEntries(report),
      ...heldFindingsOf(report).map((finding) => ({ finding, baselineState: 'unchanged' })),
    ],
    toolErrors: report.toolErrors,
    notes: report.notes,
    location: options,
    sources: 'new-findings.json with held-findings.json',
    limits: options.limits ?? SARIF_UPLOAD_LIMITS,
  });
}

export function renderSnapshotSarifReport(report, options = {}) {
  return renderSarifLog({
    entries: report.findings.map((finding) => ({ finding })),
    toolErrors: report.toolErrors,
    location: options,
    sources: 'findings.json',
    limits: options.limits ?? SARIF_UPLOAD_LIMITS,
  });
}
