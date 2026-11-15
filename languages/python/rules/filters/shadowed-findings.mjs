import { RULES_TOOL } from '../hints/tool.mjs';

const SHADOWED = [
  {
    owner: { tool: RULES_TOOL, rule: 'swallowed-exception' },
    shadowed: { tool: 'ruff', rule: 'F841' },
  },
];

function lineKey({ path, location }, rule) {
  return location?.line === undefined ? undefined : `${rule}\0${path}\0${String(location.line)}`;
}

function ownerLine(finding, keepsOwner) {
  const line = finding.location?.line;
  if (line === undefined || !keepsOwner({ owner: finding.rule, path: finding.path, line })) {
    return undefined;
  }
  return lineKey(finding, finding.rule);
}

function ownedLines(findings, keepsOwner) {
  const owners = SHADOWED.map(({ owner }) => owner);
  return new Set(
    findings
      .filter((finding) =>
        owners.some(({ tool, rule }) => finding.tool === tool && finding.rule === rule),
      )
      .map((finding) => ownerLine(finding, keepsOwner))
      .filter((key) => key !== undefined),
  );
}

export function withoutShadowedFindings(findings, { keepsOwner = () => true } = {}) {
  const owned = ownedLines(findings, keepsOwner);
  return findings.filter(
    (finding) =>
      !SHADOWED.some(
        ({ owner, shadowed }) =>
          finding.tool === shadowed.tool &&
          finding.rule === shadowed.rule &&
          owned.has(lineKey(finding, owner.rule)),
      ),
  );
}
