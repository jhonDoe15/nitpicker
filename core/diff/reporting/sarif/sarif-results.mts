import { createHash } from 'node:crypto';
import { comparisonKey } from '../../comparison/fingerprint.mjs';
import { plainText } from '../../../../shared/reference/facts.mjs';
import { entryForFinding, referenceUrl } from '../../../../shared/reference/store.mjs';
import { repositoryFindingPath } from '../../git/paths.mjs';
import type { ReferenceLinks, ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

export type SarifEntry = { readonly finding: ReportEntry; readonly baselineState?: string };

const keyOf: (finding: ReportEntry) => string = comparisonKey;
const plain: (text: unknown, root: unknown) => string = plainText;
const ruleEntry: (
  index: unknown,
  rule: { readonly tool: unknown; readonly rule: unknown },
) => unknown = entryForFinding;
const ruleUrl: (entry: unknown, root: unknown) => string | undefined = referenceUrl;
const findingPathIn: (projectPath: string, findingPath: unknown) => string = repositoryFindingPath;

const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

export const SOURCE_ROOT_ID = '%SRCROOT%';

function ruleIdOf(finding: ReportEntry): string {
  return `${textOf(finding.tool)}/${textOf(finding.rule)}`;
}

function encodePath(findingPath: string): string {
  return findingPath.split('/').map(encodeURIComponent).join('/');
}

function regionOf(location: unknown): object {
  if (location === undefined) {
    return {};
  }
  const column = fieldOf(location, 'column');
  return {
    region: {
      startLine: fieldOf(location, 'line'),
      ...(column === undefined ? {} : { startColumn: column }),
    },
  };
}

export function toSarifResult(
  { finding, baselineState }: SarifEntry,
  projectPath: string | undefined,
): object {
  const artifactLocation =
    projectPath === undefined
      ? { uri: encodePath(findingPathIn('.', finding.path)) }
      : {
          uri: encodePath(findingPathIn(projectPath, finding.path)),
          uriBaseId: SOURCE_ROOT_ID,
        };
  const physicalLocation = { artifactLocation, ...regionOf(finding['location']) };
  return {
    ruleId: ruleIdOf(finding),
    level: finding.classification === 'enforceable' ? 'error' : 'note',
    ...(baselineState === undefined ? {} : { baselineState }),
    message: { text: finding.message },
    locations: [{ physicalLocation }],
    partialFingerprints: {
      [SARIF_FINGERPRINT_KEY]: createHash('sha256').update(keyOf(finding)).digest('hex'),
    },
  };
}

function sarifRule(finding: ReportEntry, reference: ReferenceLinks): object {
  const entry = ruleEntry(reference.index(), { tool: finding.tool, rule: finding.rule });
  const helpUri = entry === undefined ? undefined : ruleUrl(entry, reference.root());
  return {
    id: ruleIdOf(finding),
    name: finding.rule,
    ...(entry === undefined
      ? {}
      : { shortDescription: { text: plain(fieldOf(entry, 'summary'), reference.root()) } }),
    ...(helpUri === undefined ? {} : { helpUri }),
  };
}

export function collectSarifRules(
  findings: readonly ReportEntry[],
  reference: ReferenceLinks,
): object[] {
  const rules = new Map<string, object>();
  for (const finding of findings) {
    const ruleId = ruleIdOf(finding);
    if (!rules.has(ruleId)) {
      rules.set(ruleId, sarifRule(finding, reference));
    }
  }
  return [...rules.values()];
}
