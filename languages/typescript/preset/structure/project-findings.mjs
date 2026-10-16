import { typescriptFileLimitFindings } from './file-limits.mjs';
import { reuseFindings } from './reuse/reuse-findings.mjs';

export function structureProjectFindings(projectRoot, analyzerName, environment = process.env) {
  return [
    ...typescriptFileLimitFindings(projectRoot, analyzerName, environment),
    ...reuseFindings(projectRoot, analyzerName, environment),
  ];
}
