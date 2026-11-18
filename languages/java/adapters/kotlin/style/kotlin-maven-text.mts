import {
  type XmlElement,
  childAt,
  childrenAt,
  childrenNamed,
  parseXml,
} from '../../../../../shared/values/xml.mts';
import { messageOf } from '../../../../../shared/values/readers.mts';

export type Formatter = { formatter: string; style?: string | undefined; via: string };

const SPOTLESS = 'com.diffplug.spotless:spotless-maven-plugin';
const KTLINT_PLUGINS = new Set([
  'com.github.gantsign.maven:ktlint-maven-plugin',
  'com.github.shyiko:ktlint-maven-plugin',
]);
const FORMATTERS = ['ktlint', 'ktfmt'];
const STYLES: Readonly<Record<string, string>> = {
  kotlinlang: 'kotlinlang',
  dropbox: 'kotlinlang',
  google: 'google',
  meta: 'meta',
};

function projectsOf(document: XmlElement): XmlElement[] {
  return document.name === 'projects' ? childrenNamed(document, 'project') : [document];
}

function configurationsOf(plugin: XmlElement): XmlElement[] {
  return [plugin, ...childrenAt(plugin, 'executions', 'execution')]
    .map((element) => childAt(element, 'configuration'))
    .filter((configuration) => configuration !== undefined);
}

function ktfmtStyleOf(element: XmlElement | undefined): string | undefined {
  return STYLES[childAt(element, 'style')?.text?.trim().toLowerCase() ?? ''];
}

function coordinatesOf(plugin: XmlElement): string {
  const group = childAt(plugin, 'groupId')?.text?.trim() ?? 'org.apache.maven.plugins';
  return `${group}:${childAt(plugin, 'artifactId')?.text?.trim() ?? ''}`;
}

function spotlessDeclarations(plugin: XmlElement): Formatter[] {
  return configurationsOf(plugin)
    .map((configuration) => childAt(configuration, 'kotlin'))
    .filter((kotlin) => kotlin !== undefined)
    .flatMap((kotlin) =>
      FORMATTERS.filter((name) => childAt(kotlin, name) !== undefined).map((name) => ({
        formatter: name,
        style: name === 'ktfmt' ? ktfmtStyleOf(childAt(kotlin, name)) : undefined,
        via: 'spotless',
      })),
    );
}

function declarationsOf(plugin: XmlElement): Formatter[] {
  const coordinates = coordinatesOf(plugin);
  if (coordinates === SPOTLESS) {
    return spotlessDeclarations(plugin);
  }
  return KTLINT_PLUGINS.has(coordinates) ? [{ formatter: 'ktlint', via: 'plugin' }] : [];
}

function parsedProjects(pom: string): { projects: XmlElement[] } | { failure: string } {
  try {
    return { projects: projectsOf(parseXml(pom)) };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

export function mavenFormatters(pom: string | undefined): Formatter[] {
  if (pom === undefined || !pom.includes('<plugin>')) {
    return [];
  }
  const parsed = parsedProjects(pom);
  const projects = 'projects' in parsed ? parsed.projects : [];
  return projects
    .flatMap((project) => childrenAt(project, 'build', 'plugins', 'plugin'))
    .flatMap(declarationsOf);
}
