import { clonePartnerPath } from '../rules/duplicates.mjs';

export function findingPaths(finding) {
  const partner = clonePartnerPath(finding);
  return partner === undefined ? [finding.path] : [finding.path, partner];
}
