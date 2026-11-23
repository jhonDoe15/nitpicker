import {
  type XmlElement,
  childrenAt,
  childrenNamed,
  parseXml,
} from '../../../../shared/ingest/report-records.mts';
import { textAt } from '../configuration/pom-elements.mts';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function serializeAttributes(attrs: Readonly<Record<string, string | undefined>>): string {
  return Object.entries(attrs)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
}

function serializeElement(element: XmlElement): string {
  const attrs = serializeAttributes(element.attrs);
  if (element.children.length > 0) {
    const inner = element.children.map(serializeElement).join('');
    return `<${element.name}${attrs}>${inner}</${element.name}>`;
  }
  if (element.text !== undefined) {
    return `<${element.name}${attrs}>${escapeXml(element.text)}</${element.name}>`;
  }
  return `<${element.name}${attrs}/>`;
}

function uniqueElements(elements: readonly XmlElement[]): XmlElement[] {
  const seen = new Set<string>();
  const unique: XmlElement[] = [];
  for (const element of elements) {
    const key = textAt(element, 'id') ?? serializeElement(element);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(element);
    }
  }
  return unique;
}

function repositoryBlock(
  projects: readonly XmlElement[],
  container: string,
  item: string,
): string | undefined {
  const entries = uniqueElements(
    projects
      .flatMap((project) => childrenAt(project, container, item))
      .filter((entry) => textAt(entry, 'url') !== undefined),
  );
  if (entries.length === 0) {
    return undefined;
  }
  return `<${container}>${entries.map(serializeElement).join('')}</${container}>`;
}

export function effectiveRepositoriesXml(effectivePom: string): string {
  if (effectivePom.trim() === '') {
    return '';
  }
  const document = parseXml(effectivePom);
  const projects = document.name === 'projects' ? childrenNamed(document, 'project') : [document];
  return [
    repositoryBlock(projects, 'repositories', 'repository'),
    repositoryBlock(projects, 'pluginRepositories', 'pluginRepository'),
  ]
    .filter((block): block is string => block !== undefined)
    .join('\n');
}
