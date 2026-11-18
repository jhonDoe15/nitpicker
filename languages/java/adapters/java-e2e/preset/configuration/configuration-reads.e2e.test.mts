import path from 'node:path';
import { describePmdRuleProbe } from '../../test-support/pmd/pmd-probe-suite.mts';

const SETTINGS = 'java/shop/settings';
const RULE = 'ConfigurationReadOutsideCompositionRoot';

describePmdRuleProbe({
  title: 'configuration reads outside the composition root without Spring',
  probeName: 'configuration-reads',
  target: SETTINGS,
  fixtures: path.resolve(
    import.meta.dirname,
    '../../fixtures/configuration-reads/src/main',
    SETTINGS,
  ),
  rule: RULE,
  marker: new RegExp(`// violation: (?:\\w+, )*${RULE}(?:, \\w+)*$`, 'u'),
  enabled: process.env['NITPICKER_JAVA_E2E'] === '1',
  gradle: process.env['NITPICKER_GRADLE'] ?? 'gradle',
  ruleset: path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml'),
  expectedCount: 11,
  mainTitle:
    'reports the marked reads and leaves main, modules, factories and typed configuration alone',
  testTitle: 'leaves test sources alone, where a test sets up its own process',
  prefixOf: (role) => `src/${role}/${SETTINGS}`,
});
