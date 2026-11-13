import { designFacts } from '../../../../../shared/rules/design/test-support/design-facts.mjs';
import { goFactFindings } from '../go-fact-findings.mjs';
import { goFacts } from '../go-facts.mjs';

export { fn, owner } from '../../../../../shared/rules/design/test-support/design-facts.mjs';

export const MODULE = 'example.com/shop';

export function goReport({ types = [], callables = [] }) {
  const { modules } = designFacts({ types, callables });
  return {
    files: modules.map(({ file }) => ({
      path: file,
      package: file.split('/').toReversed()[1] ?? 'root',
      test: false,
      generated: false,
      constrained: false,
    })),
    definitions: [],
    usages: [],
    design: { types, callables },
  };
}

export function designRows(input, rule, { module = MODULE, policy = {} } = {}) {
  const findings = goFactFindings(goFacts(goReport(input), { module }), { policy });
  return findings
    .filter((finding) => finding.rule === rule)
    .map(({ path, identity, classification, location }) => ({
      path,
      identity,
      classification,
      line: location?.line,
    }));
}
