import {
  childAt,
  childrenAt,
  childrenNamed,
  parseXml,
} from '../../../../../shared/ingest/common.mjs';

const SPOTLESS = 'spotless-maven-plugin';
const EXEC = 'exec-maven-plugin';
const FORMATTERS = ['ktlint', 'ktfmt'];
const STYLE_CALLS = {
  kotlinlang: 'kotlinlangStyle',
  dropbox: 'kotlinlangStyle',
  google: 'googleStyle',
  meta: 'metaStyle',
};

function projectsOf(document) {
  return document.name === 'projects' ? childrenNamed(document, 'project') : [document];
}

function configurationsOf(plugin) {
  return [plugin, ...childrenAt(plugin, 'executions', 'execution')]
    .map((element) => childAt(element, 'configuration'))
    .filter((configuration) => configuration !== undefined);
}

function styleCall(element) {
  const style = childAt(element, 'style')?.text?.trim().toLowerCase();
  return STYLE_CALLS[style];
}

function formatterNamed(name) {
  const lowered = (name ?? '').toLowerCase();
  return FORMATTERS.find((formatter) => lowered.includes(formatter));
}

function declarationsOf(plugin) {
  const artifact = childAt(plugin, 'artifactId')?.text;
  const configurations = configurationsOf(plugin);
  if (artifact === SPOTLESS) {
    return configurations
      .map((configuration) => childAt(configuration, 'kotlin'))
      .filter((kotlin) => kotlin !== undefined)
      .flatMap((kotlin) =>
        FORMATTERS.filter((name) => childAt(kotlin, name) !== undefined).map((name) => ({
          formatter: name,
          style: styleCall(childAt(kotlin, name)),
        })),
      );
  }
  const formatter =
    artifact === EXEC
      ? formatterNamed(configurations.map((c) => childAt(c, 'executable')?.text).find(Boolean))
      : formatterNamed(artifact);
  return formatter === undefined
    ? []
    : [{ formatter, style: configurations.map(styleCall).find(Boolean) }];
}

export function mavenFormatterText(pom) {
  if (pom === undefined || !pom.includes('<plugin>')) {
    return '';
  }
  const declarations = projectsOf(parseXml(pom))
    .flatMap((project) => childrenAt(project, 'build', 'plugins', 'plugin'))
    .flatMap(declarationsOf);
  return declarations.flatMap(({ formatter, style }) => [formatter, style ?? '']).join('\n');
}
