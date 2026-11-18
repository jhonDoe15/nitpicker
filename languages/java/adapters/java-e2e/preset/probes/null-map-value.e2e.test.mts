import path from 'node:path';
import { describePmdRuleProbe } from '../../test-support/pmd/pmd-probe-suite.mts';
const RULE = 'NullMapValue';

describePmdRuleProbe({
  title: 'null values in collected maps',
  probeName: 'null-map-value',
  target: 'java/shop/collections',
  fixtures: path.resolve(
    import.meta.dirname,
    '../../fixtures/review-rules',
    'src/main/java/shop/collections',
  ),
  rule: RULE,
  marker: new RegExp(`// violation: (?:\\w+, )*${RULE}(?:, \\w+)*$`, 'u'),
  enabled: process.env['NITPICKER_JAVA_E2E'] === '1',
  gradle: process.env['NITPICKER_GRADLE'] ?? 'gradle',
  ruleset: path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml'),
  expectedCount: 15,
  mainTitle: 'reports the marked collectors and accepts filtered values',
  testTitle: 'leaves test sources alone',
  prefixOf: (role) => `src/${role}/java/shop/collections`,
});
