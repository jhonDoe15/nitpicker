import { pathToFileURL } from 'node:url';
import { sarifRunProfile } from '../../quick/report-formats.mjs';
import { referenceLinks } from '../../../shared/reference/store.mjs';
import { noteText as textOfNote } from './format/notes.mts';
import { heldFindingsOf as heldFindings } from './report-model.mts';
import {
  type UploadLimits,
  droppedResultsText,
  renderWithinUploadLimits,
  SARIF_UPLOAD_LIMITS,
} from './sarif/sarif-limits.mts';
import {
  type SarifEntry,
  SOURCE_ROOT_ID,
  collectSarifRules,
  toSarifResult,
} from './sarif/sarif-results.mts';
import type { ReferenceLinks, ReportData, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type RunProfile = {
  readonly notifications: readonly unknown[];
  readonly properties: Readonly<Record<string, unknown>>;
};

type SarifLocation = {
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
  readonly reference?: ReferenceLinks | undefined;
};

export type SarifOptions = SarifLocation & { readonly limits?: UploadLimits | undefined };

type SarifRun = {
  readonly entries: readonly SarifEntry[];
  readonly toolErrors: readonly ReportEntry[];
  readonly notes: readonly ReportEntry[];
  readonly location: SarifLocation;
  readonly dropped: string | undefined;
  readonly reference: ReferenceLinks;
  readonly profile: RunProfile;
};

type SarifLog = {
  readonly entries: readonly SarifEntry[];
  readonly toolErrors: readonly ReportEntry[];
  readonly notes?: readonly ReportEntry[] | undefined;
  readonly location: SarifLocation;
  readonly sources: string;
  readonly newFirst?: boolean;
  readonly limits: UploadLimits;
  readonly summary?: unknown;
};

type SnapshotData = {
  readonly findings: readonly ReportEntry[];
  readonly toolErrors: readonly ReportEntry[];
  readonly summary: unknown;
};

const runProfileOf: (summary: unknown) => RunProfile = sarifRunProfile;
const links: () => ReferenceLinks = referenceLinks;

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';

const SOURCE_ROOT_DESCRIPTION = 'The root of the git repository the findings are in.';

const COLUMN_KIND = 'utf16CodeUnits';

function originalUriBaseIds({ projectPath, repositoryRoot }: SarifLocation): object {
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

function notifications({
  toolErrors,
  notes,
  dropped,
  profile,
}: Pick<SarifRun, 'toolErrors' | 'notes' | 'dropped' | 'profile'>): unknown[] {
  return [
    ...toolErrors.map((error) => ({
      level: 'error',
      message: {
        text: `${textOf(error.tool)} (${textOf(error.snapshot)}): ${textOf(error.message)}`,
      },
    })),
    ...notes.map((note) => ({ level: 'note', message: { text: textOfNote(note) } })),
    ...(dropped === undefined ? [] : [{ level: 'warning', message: { text: dropped } }]),
    ...profile.notifications,
  ];
}

function renderSarifRun({
  entries,
  toolErrors,
  notes,
  location,
  dropped,
  reference,
  profile,
}: SarifRun): string {
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'nitpicker',
            informationUri: 'https://github.com/jhonDoe15/nitpicker',
            rules: collectSarifRules(
              entries.map(({ finding }) => finding),
              reference,
            ),
          },
        },
        ...originalUriBaseIds(location),
        columnKind: COLUMN_KIND,
        invocations: [
          {
            executionSuccessful: toolErrors.length === 0,
            toolExecutionNotifications: notifications({ toolErrors, notes, dropped, profile }),
            ...(Object.keys(profile.properties).length === 0
              ? {}
              : { properties: profile.properties }),
          },
        ],
        results: entries.map((entry) => toSarifResult(entry, location.projectPath)),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

function renderSarifLog({
  entries,
  toolErrors,
  notes = [],
  location,
  sources,
  newFirst = true,
  limits,
  summary = {},
}: SarifLog): string {
  const reference = location.reference ?? links();
  const profile = runProfileOf(summary);
  return renderWithinUploadLimits(
    entries,
    (kept) =>
      renderSarifRun({
        entries: kept,
        toolErrors,
        notes,
        location,
        reference,
        profile,
        dropped:
          kept.length === entries.length
            ? undefined
            : droppedResultsText(
                { kept: kept.length, total: entries.length, sources, newFirst },
                limits,
              ),
      }),
    limits,
  );
}

function newEntries(report: ReportData): SarifEntry[] {
  return report.newFindings.map((finding) => ({ finding, baselineState: 'new' }));
}

export function renderSarifReport(report: ReportData, options: SarifOptions = {}): string {
  return renderSarifLog({
    entries: newEntries(report),
    toolErrors: report.toolErrors,
    notes: report.notes,
    location: options,
    sources: 'new-findings.json',
    limits: options.limits ?? SARIF_UPLOAD_LIMITS,
    summary: report.summary,
  });
}

export function renderBaselineSarifReport(report: ReportData, options: SarifOptions = {}): string {
  return renderSarifLog({
    entries: [
      ...newEntries(report),
      ...heldFindings(report).map((finding) => ({ finding, baselineState: 'unchanged' })),
    ],
    toolErrors: report.toolErrors,
    notes: report.notes,
    location: options,
    sources: 'new-findings.json with held-findings.json',
    limits: options.limits ?? SARIF_UPLOAD_LIMITS,
    summary: report.summary,
  });
}

export function renderSnapshotSarifReport(
  report: SnapshotData,
  options: SarifOptions = {},
): string {
  return renderSarifLog({
    entries: report.findings.map((finding) => ({ finding })),
    toolErrors: report.toolErrors,
    location: options,
    sources: 'findings.json',
    newFirst: false,
    limits: options.limits ?? SARIF_UPLOAD_LIMITS,
    summary: report.summary,
  });
}
