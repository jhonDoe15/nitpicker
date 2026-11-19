import path from 'node:path';
import { describePmdRuleProbe } from '../../test-support/pmd/pmd-probe-suite.mts';
const RULE = 'HandSplitHttpHeader';

describePmdRuleProbe({
  title: 'hand-split HTTP headers',
  probeName: 'http-header-split',
  target: 'java/shop/web',
  fixtures: path.resolve(
    import.meta.dirname,
    '../../fixtures/review-rules',
    'src/main/java/shop/web',
  ),
  rule: RULE,
  marker: new RegExp(`// violation: (?:\\w+, )*${RULE}(?:, \\w+)*$`, 'u'),
  enabled: process.env['NITPICKER_JAVA_E2E'] === '1',
  gradle: process.env['NITPICKER_GRADLE'] ?? 'gradle',
  ruleset: path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml'),
  expectedCount: 5,
  mainTitle:
    'reports the marked splits and accepts only the Content-Type read before the semicolon',
  testTitle: 'leaves test sources alone',
  prefixOf: (role) => `src/${role}/java/shop/web`,
});
