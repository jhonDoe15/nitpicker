import path from 'node:path';
import { describePmdRuleProbe } from '../../test-support/pmd/pmd-probe-suite.mts';
const RULE = 'HttpWithoutTimeout';

describePmdRuleProbe({
  title: 'HTTP calls without a timeout in a project without Spring',
  probeName: 'http-timeouts',
  target: 'java/shop/remote',
  fixtures: path.resolve(
    import.meta.dirname,
    '../../fixtures/review-rules',
    'src/main/java/shop/remote',
  ),
  rule: RULE,
  marker: new RegExp(`// violation: (?:\\w+, )*${RULE}(?:, \\w+)*$`, 'u'),
  enabled: process.env['NITPICKER_JAVA_E2E'] === '1',
  gradle: process.env['NITPICKER_GRADLE'] ?? 'gradle',
  ruleset: path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml'),
  expectedCount: 15,
  mainTitle:
    'reports the marked calls from the main rule set, with no classpath to resolve the clients',
  testTitle: 'leaves test sources alone, where a test talks to a local fake',
  prefixOf: (role) => `src/${role}/java/shop/remote`,
});
