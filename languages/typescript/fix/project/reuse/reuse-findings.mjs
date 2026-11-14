import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function reuseFindingsFor(context, rule) {
  const { reuseFindings } = require('../../../preset/structure/reuse/reuse-findings.mjs');
  const environment = context.inputs?.policyEnvironment ?? {};
  return reuseFindings(
    { projectRoot: context.projectRoot, analyzerName: 'structure' },
    environment,
  ).filter((finding) => finding.rule === rule);
}
