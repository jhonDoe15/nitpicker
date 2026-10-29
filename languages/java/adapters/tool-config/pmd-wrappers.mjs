import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
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
    ...rules.map((file) => `  <rule ref="${escapeXml(file)}"/>`),
    '</ruleset>',
    '',
  ].join('\n');
}

export function writeRulesets({ module, reportDir, configs, spring, reactor = false }) {
  const mainRuleset = path.join(reportDir, 'pmd-main.xml');
  writeFileSync(
    mainRuleset,
    rulesetExcluding({
      name: 'nitpicker-main',
      description: "Nitpicker's main-only rules on main sources only.",
      rules: [
        path.join(GRADLE_DIRECTORY, 'pmd-main-ruleset.xml'),
        ...(spring ? [path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml')] : []),
        ...(reactor ? [path.join(GRADLE_DIRECTORY, 'reactor-ruleset.xml')] : []),
      ],
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
      rules: [
        layers.tests ?? TEST_RULESET,
        ...(spring ? [path.join(GRADLE_DIRECTORY, 'spring-test-ruleset.xml')] : []),
      ],
      roots: module.sourceRoots,
    }),
  );
  return { mainRuleset, testsRuleset, layers };
}
