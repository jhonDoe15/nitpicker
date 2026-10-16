import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { escapeXml } from './xml-write.mjs';
import { pmdLayerFiles, TEST_RULESET } from './layer-files.mjs';

function rulesetExcluding({ name, description, rules, roots }) {
  const excludes = roots.map(
    (root) =>
      `  <exclude-pattern>${escapeXml(`${escapeRegExp(root + path.sep)}.*`)}</exclude-pattern>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ruleset name="${name}" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">`,
    `  <description>${description}</description>`,
    ...excludes,
    `  <rule ref="${escapeXml(rules)}"/>`,
    '</ruleset>',
    '',
  ].join('\n');
}

export function writeRulesets({ module, reportDir, configs }) {
  const springRuleset = path.join(reportDir, 'pmd-spring-main.xml');
  writeFileSync(
    springRuleset,
    rulesetExcluding({
      name: 'nitpicker-spring-main',
      description: "Nitpicker's Spring rules on main sources only.",
      rules: path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml'),
      roots: module.testSourceRoots,
    }),
  );
  const layers = pmdLayerFiles({ ...configs.pmd, directory: reportDir });
  const testsRuleset = path.join(reportDir, 'pmd-tests.xml');
  writeFileSync(
    testsRuleset,
    rulesetExcluding({
      name: 'nitpicker-tests',
      description: "Nitpicker's test-only rules on test sources only.",
      rules: layers.tests ?? TEST_RULESET,
      roots: module.sourceRoots,
    }),
  );
  return { springRuleset, testsRuleset, layers };
}
