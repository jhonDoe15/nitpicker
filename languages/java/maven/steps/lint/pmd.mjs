import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireReport, runJavaTool } from '../java-tool.mjs';
import { springOnMainSources } from './spring-main-ruleset.mjs';

const PMD_VIOLATIONS = 4;
const PMD_RECOVERABLE_ERRORS = 5;

function unique(values) {
  return [...new Set(values)];
}

export function pmdRulesets(context) {
  const { toolConfig, rulesetDirectory, module, reportRoot, spring } = context;
  const nitpicker = toolConfig.pmd.nitpicker
    ? [path.join(rulesetDirectory, 'pmd-ruleset.xml')]
    : [];
  const project = toolConfig.pmd.project === undefined ? [] : [toolConfig.pmd.project];
  const springMain = path.join(reportRoot, 'pmd-spring-main.xml');
  if (toolConfig.pmd.nitpicker && spring) {
    writeFileSync(
      springMain,
      springOnMainSources(
        path.join(rulesetDirectory, 'spring-ruleset.xml'),
        module.testSourceRoots,
      ),
    );
  }
  return [...nitpicker, ...project, ...(toolConfig.pmd.nitpicker && spring ? [springMain] : [])];
}

export function runPmd(context) {
  const { module, reportRoot, tools, classpaths } = context;
  const report = path.join(reportRoot, 'pmd.sarif');
  const auxiliary = path.join(reportRoot, 'pmd-aux-classpath.txt');
  writeFileSync(
    auxiliary,
    unique(
      [...classpaths.test, module.classesDirectory, module.testClassesDirectory].filter((entry) =>
        existsSync(entry),
      ),
    ).join('\n'),
  );
  runJavaTool(context, {
    label: 'PMD',
    classpath: tools.classpath('pmd'),
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    okExit: [0, PMD_VIOLATIONS, PMD_RECOVERABLE_ERRORS],
    args: [
      'check',
      '--no-cache',
      '--no-progress',
      '--format',
      'sarif',
      '--report-file',
      report,
      '--rulesets',
      pmdRulesets(context).join(','),
      '--aux-classpath',
      `file:${auxiliary}`,
      '--suppress-marker',
      'NITPICKER-NO-INLINE-SUPPRESSION',
      '--dir',
      [...module.sourceRoots, ...module.testSourceRoots].join(','),
    ],
  });
  requireReport(report, 'PMD');
}
