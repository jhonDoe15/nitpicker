import { childAt } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import { parsedXml } from './parsed-xml.mts';
import { stepFormatterDetails } from '../java-formatter-options.mts';
import type { FormatterDetails, FormatterEntry } from '../java-formatter-options.mts';
import type { Optional } from '../../typed/optional.mts';
import { createReading, flagValue, versionValue } from './formatter-values.mts';
import type { Reading } from './formatter-values.mts';
import { mavenValue } from './value-references.mts';
import { SPRING_JAVA_FORMAT, springFormatInPom } from '../spring-format/spring-java-format.mts';
import { appendAll } from '../../../../../shared/lists/items.mjs';

const PALANTIR_STYLE = 'palantir';
const GOOGLE_STYLE = 'google';
const MAVEN_FORMATTER_ARTIFACTS = new Map<string, FormatterEntry>([
  ['palantir-java-format', { formatter: PALANTIR_STYLE }],
  ['google-java-format', { formatter: GOOGLE_STYLE }],
]);

function descendants(root: XmlElement, name: string): XmlElement[] {
  const found = [root];
  for (const node of found) {
    appendAll(found, node.children);
  }
  return found.filter((node) => node.name === name);
}

function styleOf(node: XmlElement): string | undefined {
  return childAt(node, 'style')?.text?.toLowerCase();
}

export function pomProperties(poms: XmlElement[]): Map<string, string> {
  const properties = new Map<string, string>();
  for (const root of poms) {
    for (const node of childAt(root, 'properties')?.children ?? []) {
      properties.set(node.name, node.text?.trim() ?? '');
    }
  }
  return properties;
}

function mavenReading(file: string, properties: Map<string, string>): Reading {
  return createReading(file, (text: string) => mavenValue(text, properties));
}

function mavenFlag(step: XmlElement, name: string, reading: Reading): Optional<boolean> {
  const text = childAt(step, name)?.text;
  return text === undefined ? undefined : flagValue(text, name, reading);
}

function spotlessStep(step: XmlElement, reading: Reading): FormatterEntry | undefined {
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

function mavenDetails(step: XmlElement, formatter: string, reading: Reading): FormatterDetails {
  const version = childAt(step, 'version')?.text;
  return stepFormatterDetails(formatter, {
    version: version === undefined ? undefined : versionValue(version, reading),
    formatJavadoc: mavenFlag(step, 'formatJavadoc', reading),
    reflowLongStrings: mavenFlag(step, 'reflowLongStrings', reading),
  });
}

function pluginDeclarations(plugin: XmlElement, reading: Reading): (FormatterEntry | undefined)[] {
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

export function declaredInPom(
  { file, text }: { file: string; text: string },
  properties: Map<string, string>,
): { failure?: string | undefined; entries: FormatterEntry[]; notes: string[] } {
  const { root, failure } = parsedXml(text);
  if (root === undefined) {
    return { failure, entries: [], notes: [] };
  }
  const reading = mavenReading(file, properties);
  const artifacts = descendants(root, 'artifactId').map((node) =>
    MAVEN_FORMATTER_ARTIFACTS.get(node.text ?? ''),
  );
  const entries = [
    ...descendants(root, 'plugin').flatMap((plugin) => pluginDeclarations(plugin, reading)),
    ...artifacts,
    ...(springFormatInPom(root) ? [{ formatter: SPRING_JAVA_FORMAT }] : []),
  ].filter((entry): entry is FormatterEntry => entry !== undefined);
  return { entries, notes: [...reading.notes] };
}
