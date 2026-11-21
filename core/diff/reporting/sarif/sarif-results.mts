import { createHash } from 'node:crypto';
import { entryKey } from '../../comparison/fingerprint.mts';
import { plainText } from '../../../../shared/reference/facts.mts';
import { entryForFinding, referenceUrl } from '../../../../shared/reference/store.mts';
import { repositoryFindingPath } from '../../git/paths.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import type { ReferenceLinks } from '../../../../shared/reference/typed/entry-types.mts';
import { sarifFixes } from './sarif-fixes.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { type LabelsOf, findingLabeler } from '../../../labels/finding-labels.mts';
import { areaOf } from '../format/rule-groups/finding-areas.mts';

export type SarifEntry = { readonly finding: ReportEntry; readonly baselineState?: string };

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

function sarifArtifactLocation(findingPath: string, projectPath: string | undefined): object {
  return projectPath === undefined
    ? { uri: encodePath(repositoryFindingPath('.', findingPath)) }
    : {
        uri: encodePath(repositoryFindingPath(projectPath, findingPath)),
        uriBaseId: SOURCE_ROOT_ID,
      };
}

const fixesOf: (finding: ReportEntry, artifactLocation: (name: string) => object) => object =
  sarifFixes;

export function toSarifResult(
  { finding, baselineState }: SarifEntry,
  projectPath: string | undefined,
): object {
  const artifactLocation = sarifArtifactLocation(textOf(finding.path), projectPath);
  const physicalLocation = { artifactLocation, ...regionOf(finding['location']) };
  return {
    ruleId: ruleIdOf(finding),
    level: finding.classification === 'enforceable' ? 'error' : 'note',
    ...(baselineState === undefined ? {} : { baselineState }),
    message: { text: finding.message },
    locations: [{ physicalLocation }],
    partialFingerprints: {
      [SARIF_FINGERPRINT_KEY]: createHash('sha256').update(entryKey(finding)).digest('hex'),
    },
    ...fixesOf(finding, (name) => sarifArtifactLocation(name, projectPath)),
  };
}

function sarifRule(finding: ReportEntry, reference: ReferenceLinks, labelsOf: LabelsOf): object {
  const entry = entryForFinding(reference.index(), {
    tool: textOf(finding.tool),
    rule: textOf(finding.rule),
  });
  const helpUri = entry === undefined ? undefined : referenceUrl(entry, reference.root());
  return {
    id: ruleIdOf(finding),
    name: finding.rule,
    ...(entry === undefined
      ? {}
      : { shortDescription: { text: plainText(entry.summary, reference.root()) } }),
    ...(helpUri === undefined ? {} : { helpUri }),
    properties: { tags: [...labelsOf(finding)] },
  };
}

export function collectSarifRules(
  findings: readonly ReportEntry[],
  reference: ReferenceLinks,
): object[] {
  const rules = new Map<string, object>();
  const labelsOf = findingLabeler({ areaOf, index: () => reference.index() });
  for (const finding of findings) {
    const ruleId = ruleIdOf(finding);
    if (!rules.has(ruleId)) {
      rules.set(ruleId, sarifRule(finding, reference, labelsOf));
    }
  }
  return [...rules.values()];
}
