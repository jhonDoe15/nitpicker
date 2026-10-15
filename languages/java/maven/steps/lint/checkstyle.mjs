import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireReport, runJavaTool } from '../java-tool.mjs';
import { checkstyleProperties, nitpickerCheckstyleConfig } from './checkstyle-config.mjs';

const REPORTS = [
  ['sourceRoots', 'checkstyle.xml'],
  ['testSourceRoots', 'checkstyle-test.xml'],
];

function configuration(context) {
  const { toolConfig, reportRoot, tools, rulesetDirectory } = context;
  if (toolConfig.checkstyle.project !== undefined) {
    return ['-c', toolConfig.checkstyle.project];
  }
  const config = path.join(reportRoot, 'nitpicker-checkstyle-config.xml');
  const properties = path.join(reportRoot, 'nitpicker-checkstyle.properties');
  writeFileSync(config, nitpickerCheckstyleConfig(readFileSync(tools.checkstyleConfig, 'utf8')));
  writeFileSync(
    properties,
    checkstyleProperties(path.join(rulesetDirectory, 'checkstyle-suppressions.xml')),
  );
  return ['-c', config, '-p', properties];
}

export function runCheckstyle(context) {
  const { module, reportRoot, tools, versions } = context;
  const options = configuration(context);
  if (module.sourceRoots.length === 0) {
    writeFileSync(
      path.join(reportRoot, 'checkstyle.xml'),
      `<checkstyle version="${versions.checkstyle}"></checkstyle>`,
    );
  }
  for (const [roots, name] of REPORTS) {
    if (module[roots].length > 0) {
      const report = path.join(reportRoot, name);
      runJavaTool(context, {
        label: 'Checkstyle',
        classpath: tools.classpath('checkstyle'),
        mainClass: 'com.puppycrawl.tools.checkstyle.Main',
        args: [...options, '-f', 'xml', '-o', report, ...module[roots]],
      });
      requireReport(report, 'Checkstyle');
    }
  }
}
