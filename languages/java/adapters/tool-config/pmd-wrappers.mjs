import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { escapeXml } from './xml-write.mjs';
import { MAIN_RULESET, pmdLayerFiles, TEST_RULESET } from './layer-files.mjs';

function reference(file) {
  return `  <rule ref="${escapeXml(file)}"/>`;
}

const SPRING_DATA_RULES = [
  'SpringDataRowWriteInLoop',
  'SpringDataNoFlush',
  'SpringDataNoSaveInLoop',
  'SpringDataSaveInLoopHelper',
  'SpringDataNativeQuery',
];

function springReference(file, springData) {
  const excluded = springData ? [] : SPRING_DATA_RULES.map((name) => `<exclude name="${name}"/>`);
  return `  <rule ref="${escapeXml(file)}">${excluded.join('')}</rule>`;
}

function mainReferences(file, springData) {
  const ref = escapeXml(file);
  return springData
    ? [
        `  <rule ref="${ref}"><exclude name="IoCallInLoop"/></rule>`,
        `  <rule ref="${ref}/IoCallInLoop"><properties><property name="springData" value="true"/></properties></rule>`,
      ]
    : [reference(file)];
}

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
    ...rules,
    '</ruleset>',
    '',
  ].join('\n');
}

export function writeRulesets({
  module,
  reportDir,
  configs,
  spring,
  springData = false,
  springRules,
  reactor = false,
}) {
  const layers = pmdLayerFiles({ ...configs.pmd, directory: reportDir });
  const mainRuleset = path.join(reportDir, 'pmd-main.xml');
  writeFileSync(
    mainRuleset,
    rulesetExcluding({
      name: 'nitpicker-main',
      description: "Nitpicker's main-only rules on main sources only.",
      rules: [
        ...mainReferences(layers.main ?? MAIN_RULESET, spring && springData),
        ...(spring
          ? [
              springReference(
                springRules ?? path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml'),
                springData,
              ),
            ]
          : []),
        ...(reactor ? [path.join(GRADLE_DIRECTORY, 'reactor-ruleset.xml')] : []).map(reference),
      ],
      roots: module.testSourceRoots,
    }),
  );
  const testsRuleset = path.join(reportDir, 'pmd-tests.xml');
  writeFileSync(
    testsRuleset,
    rulesetExcluding({
      name: 'nitpicker-tests',
      description: "Nitpicker's test-only rules on test sources only.",
      rules: [
        reference(layers.tests ?? TEST_RULESET),
        ...(spring ? [path.join(GRADLE_DIRECTORY, 'spring-test-ruleset.xml')] : []).map(reference),
      ],
      roots: module.sourceRoots,
    }),
  );
  return { mainRuleset, testsRuleset, layers };
}
