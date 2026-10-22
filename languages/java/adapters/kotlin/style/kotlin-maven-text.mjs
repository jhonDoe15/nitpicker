import {
  childAt,
  childrenAt,
  childrenNamed,
  parseXml,
} from '../../../../../shared/ingest/common.mjs';

const SPOTLESS = 'com.diffplug.spotless:spotless-maven-plugin';
const KTLINT_PLUGINS = new Set([
  'com.github.gantsign.maven:ktlint-maven-plugin',
  'com.github.shyiko:ktlint-maven-plugin',
]);
const FORMATTERS = ['ktlint', 'ktfmt'];
const STYLES = { kotlinlang: 'kotlinlang', dropbox: 'kotlinlang', google: 'google', meta: 'meta' };

function projectsOf(document) {
  return document.name === 'projects' ? childrenNamed(document, 'project') : [document];
}

function configurationsOf(plugin) {
  return [plugin, ...childrenAt(plugin, 'executions', 'execution')]
    .map((element) => childAt(element, 'configuration'))
    .filter((configuration) => configuration !== undefined);
}

function ktfmtStyleOf(element) {
  return STYLES[childAt(element, 'style')?.text?.trim().toLowerCase()];
}

function coordinatesOf(plugin) {
  const group = childAt(plugin, 'groupId')?.text?.trim() ?? 'org.apache.maven.plugins';
  return `${group}:${childAt(plugin, 'artifactId')?.text?.trim()}`;
}

function spotlessDeclarations(plugin) {
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

function declarationsOf(plugin) {
  const coordinates = coordinatesOf(plugin);
  if (coordinates === SPOTLESS) {
    return spotlessDeclarations(plugin);
  }
  return KTLINT_PLUGINS.has(coordinates) ? [{ formatter: 'ktlint', via: 'plugin' }] : [];
}

function parsedProjects(pom) {
  try {
    return projectsOf(parseXml(pom));
  } catch {
    return [];
  }
}

export function mavenFormatters(pom) {
  if (pom === undefined || !pom.includes('<plugin>')) {
    return [];
  }
  return parsedProjects(pom)
    .flatMap((project) => childrenAt(project, 'build', 'plugins', 'plugin'))
    .flatMap(declarationsOf);
}
