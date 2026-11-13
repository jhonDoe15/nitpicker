import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { escapeXml } from '../../tool-config/xml-write.mjs';
import { type ProxyAnnotations, projectProxyAnnotations } from './proxy-annotations.mts';
import { textOf } from '../../../../../shared/values/readers.mts';

export const SPRING_RULESET = path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml');
const PROXY_RULES = ['SpringProxyMethodVisibility', 'SpringProxySelfCall'];
const RULESET_FILE = 'spring-ruleset-project.xml';

function escaped(text: string): string {
  return textOf(escapeXml(text));
}

function property(name: string, values: readonly string[]): string {
  return `      <property name="${name}" value="${escaped(values.join(','))}"/>`;
}

export function springRuleset({ proxied, constraints }: ProxyAnnotations): string {
  const reference = escaped(SPRING_RULESET);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ruleset name="nitpicker-spring" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
    "  <description>Nitpicker's Spring rules, told the project's own proxied annotations.</description>",
    `  <rule ref="${reference}">`,
    ...PROXY_RULES.map((rule) => `    <exclude name="${rule}"/>`),
    '  </rule>',
    ...PROXY_RULES.flatMap((rule) => [
      `  <rule ref="${reference}/${rule}">`,
      '    <properties>',
      property('projectProxyAnnotations', proxied),
      property('projectConstraintAnnotations', constraints),
      '    </properties>',
      '  </rule>',
    ]),
    '</ruleset>',
    '',
  ].join('\n');
}

export function writeSpringRuleset(projectRoot: string, directory: string): string | undefined {
  const annotations = projectProxyAnnotations(projectRoot);
  if (annotations.proxied.length === 0 && annotations.constraints.length === 0) {
    return undefined;
  }
  const file = path.join(directory, RULESET_FILE);
  writeFileSync(file, springRuleset(annotations));
  return file;
}
