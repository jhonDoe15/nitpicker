import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { escapeXml } from '../../tool-config/xml-write.mjs';
import { projectProxyAnnotations } from './proxy-annotations.mjs';

export const SPRING_RULESET = path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml');
const PROXY_RULES = ['SpringProxyMethodVisibility', 'SpringProxySelfCall'];
const RULESET_FILE = 'spring-ruleset-project.xml';

function property(name, values) {
  return `      <property name="${name}" value="${escapeXml(values.join(','))}"/>`;
}

export function springRuleset({ proxied, constraints }) {
  const reference = escapeXml(SPRING_RULESET);
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

/**
 * Writes the Spring ruleset for a project that declares proxied annotations of its own, and returns
 * its path; undefined when the project declares none, so the plain ruleset applies.
 */
export function writeSpringRuleset(projectRoot, directory) {
  const annotations = projectProxyAnnotations(projectRoot);
  if (annotations.proxied.length === 0 && annotations.constraints.length === 0) {
    return undefined;
  }
  const file = path.join(directory, RULESET_FILE);
  writeFileSync(file, springRuleset(annotations));
  return file;
}
