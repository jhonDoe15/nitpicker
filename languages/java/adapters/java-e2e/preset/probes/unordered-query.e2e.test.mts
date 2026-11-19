import path from 'node:path';
import { describePmdRuleProbe } from '../../test-support/pmd/pmd-probe-suite.mts';
const RULE = 'UnorderedQuery';

describePmdRuleProbe({
  title: 'unordered paged queries',
  probeName: 'unordered-query',
  target: 'java/shop/queries',
  fixtures: path.resolve(
    import.meta.dirname,
    '../../fixtures/review-rules',
    'src/main/java/shop/queries',
  ),
  rule: RULE,
  marker: new RegExp(`// violation: (?:\\w+, )*${RULE}(?:, \\w+)*$`, 'u'),
  enabled: process.env['NITPICKER_JAVA_E2E'] === '1',
  gradle: process.env['NITPICKER_GRADLE'] ?? 'gradle',
  ruleset: path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml'),
  expectedCount: 13,
  mainTitle: 'reports the marked pages and accepts ordered pages and existence probes',
  testTitle: 'leaves test sources alone',
  prefixOf: (role) => `src/${role}/java/shop/queries`,
});
