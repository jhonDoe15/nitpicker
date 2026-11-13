import { childAt, parseXml } from '../../../../../shared/ingest/common.mjs';
import { stepFormatterDetails } from '../java-formatter-options.mjs';
import { flagValue, versionValue } from './formatter-values.mjs';
import { mavenValue } from './value-references.mjs';

const PALANTIR_STYLE = 'palantir';
const GOOGLE_STYLE = 'google';
const MAVEN_FORMATTER_ARTIFACTS = new Map([
  ['palantir-java-format', { formatter: PALANTIR_STYLE }],
  ['google-java-format', { formatter: GOOGLE_STYLE }],
]);

function descendants(root, name) {
  const found = [root];
  for (const node of found) {
    found.push(...node.children);
  }
  return found.filter((node) => node.name === name);
}

function styleOf(node) {
  return childAt(node, 'style')?.text?.toLowerCase();
}

export function pomProperties(poms) {
  const properties = new Map();
  for (const root of poms) {
    for (const node of childAt(root, 'properties')?.children ?? []) {
      properties.set(node.name, node.text?.trim() ?? '');
    }
  }
  return properties;
}

function mavenReading(file, properties) {
  return { file, notes: [], resolve: (text) => mavenValue(text, properties) };
}

function mavenFlag(step, name, reading) {
  const text = childAt(step, name)?.text;
  return text === undefined ? undefined : flagValue(text, name, reading);
}

function spotlessStep(step, reading) {
  const name = step.name.toLowerCase();
  const style = styleOf(step);
  if (name === 'googlejavaformat') {
    return {
      formatter: GOOGLE_STYLE,
      aosp: style === 'aosp',
      ...mavenDetails(step, GOOGLE_STYLE, reading),
    };
  }
  if (name === 'palantirjavaformat') {
    return style === GOOGLE_STYLE || style === 'aosp'
      ? { formatter: GOOGLE_STYLE, aosp: style === 'aosp' }
      : { formatter: PALANTIR_STYLE, ...mavenDetails(step, PALANTIR_STYLE, reading) };
  }
  return name === 'eclipse' || name === 'prettier' ? { formatter: 'none' } : undefined;
}

function mavenDetails(step, formatter, reading) {
  const version = childAt(step, 'version')?.text;
  return stepFormatterDetails(formatter, {
    version: version === undefined ? undefined : versionValue(version, reading),
    formatJavadoc: mavenFlag(step, 'formatJavadoc', reading),
    reflowLongStrings: mavenFlag(step, 'reflowLongStrings', reading),
  });
}

function pluginDeclarations(plugin, reading) {
  const artifact = childAt(plugin, 'artifactId')?.text;
  if (artifact === 'fmt-maven-plugin') {
    return [
      {
        formatter: GOOGLE_STYLE,
        aosp: styleOf(childAt(plugin, 'configuration') ?? plugin) === 'aosp',
      },
    ];
  }
  return artifact === 'spotless-maven-plugin'
    ? descendants(plugin, 'java').flatMap((java) =>
        java.children.map((step) => spotlessStep(step, reading)),
      )
    : [];
}

export function parsedPom(text) {
  try {
    return { root: parseXml(text) };
  } catch (error) {
    return { failure: error.message };
  }
}

export function declaredInPom({ file, text }, properties) {
  const { root, failure } = parsedPom(text);
  if (root === undefined) {
    return { failure, entries: [], notes: [] };
  }
  const reading = mavenReading(file, properties);
  const artifacts = descendants(root, 'artifactId').map((node) =>
    MAVEN_FORMATTER_ARTIFACTS.get(node.text),
  );
  const entries = [
    ...descendants(root, 'plugin').flatMap((plugin) => pluginDeclarations(plugin, reading)),
    ...artifacts,
  ].filter((entry) => entry !== undefined);
  return { entries, notes: reading.notes };
}
