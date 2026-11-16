import { RULES_TOOL } from '../hints/tool.mts';

type LocatedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly location?: { readonly line?: number | undefined } | undefined;
};
type KeepsOwner = (site: { owner: string; path: string; line: number }) => boolean;

const SHADOWED = [
  {
    owner: { tool: RULES_TOOL, rule: 'swallowed-exception' },
    shadowed: { tool: 'ruff', rule: 'F841' },
  },
];

function lineKey({ path, location }: LocatedFinding, rule: string): string | undefined {
  return location?.line === undefined ? undefined : `${rule}\0${path}\0${String(location.line)}`;
}

function ownerLine(finding: LocatedFinding, keepsOwner: KeepsOwner): string | undefined {
  const line = finding.location?.line;
  if (line === undefined || !keepsOwner({ owner: finding.rule, path: finding.path, line })) {
    return undefined;
  }
  return lineKey(finding, finding.rule);
}

function ownedLines(findings: readonly LocatedFinding[], keepsOwner: KeepsOwner): Set<string> {
  const owners = SHADOWED.map(({ owner }) => owner);
  return new Set(
    findings
      .filter((finding) =>
        owners.some(({ tool, rule }) => finding.tool === tool && finding.rule === rule),
      )
      .map((finding) => ownerLine(finding, keepsOwner))
      .filter((key): key is string => key !== undefined),
  );
}

export function withoutShadowedFindings<Finding extends LocatedFinding>(
  findings: readonly Finding[],
  { keepsOwner = () => true }: { readonly keepsOwner?: KeepsOwner } = {},
): Finding[] {
  const owned = ownedLines(findings, keepsOwner);
  return findings.filter(
    (finding) =>
      !SHADOWED.some(
        ({ owner, shadowed }) =>
          finding.tool === shadowed.tool &&
          finding.rule === shadowed.rule &&
          owned.has(lineKey(finding, owner.rule) ?? ''),
      ),
  );
}
