import { childrenNamed, parseXml } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import type { LayerInput } from './checkstyle-types.mts';
import { renderXml } from '../xml-write.mts';
import { appendAll } from '../../../../../shared/lists/items.mjs';

type Group = {
  readonly base: XmlElement;
  properties: XmlElement[];
  rest: XmlElement[];
  readonly pending: XmlElement[];
  children: Group[];
};

const PROPERTY = 'property';
const DOCTYPE_ID = '-//Checkstyle//DTD Checkstyle Configuration 1.3//EN';
const DOCTYPE_URL = 'https://checkstyle.org/dtds/configuration_1_3.dtd';
const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';
const DECLARATION = `${XML_PROLOG}\n<!DOCTYPE module PUBLIC "${DOCTYPE_ID}" "${DOCTYPE_URL}">\n`;
const INLINE_FILTERS = new Set([
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressWithPlainTextCommentFilter',
  'SuppressionXpathFilter',
]);

function nameOf(module: XmlElement): string {
  return (
    (module.attrs['name'] ?? '')
      .split('.')
      .at(-1)
      ?.replace(/Check$/u, '') ?? ''
  );
}

function isModule(node: XmlElement): boolean {
  return node.name === 'module';
}

function withoutInlineFilters(root: XmlElement): XmlElement {
  const order = [root];
  for (const module of order) {
    appendAll(order, module.children.filter(isModule));
  }
  const rewritten = new Map<XmlElement, XmlElement>();
  for (const module of order.toReversed()) {
    const children = module.children
      .filter((child) => !(isModule(child) && INLINE_FILTERS.has(nameOf(child))))
      .map((child) => rewritten.get(child) ?? child);
    rewritten.set(module, { ...module, children });
  }
  return rewritten.get(root) ?? root;
}

function idOf(module: XmlElement): string | undefined {
  return childrenNamed(module, PROPERTY).find(({ attrs }) => attrs['name'] === 'id')?.attrs[
    'value'
  ];
}

function isFilter(module: XmlElement): boolean {
  return nameOf(module).endsWith('Filter');
}

function partsOf(module: XmlElement): {
  properties: XmlElement[];
  modules: XmlElement[];
  rest: XmlElement[];
} {
  return {
    properties: childrenNamed(module, PROPERTY),
    modules: module.children.filter(isModule),
    rest: module.children.filter((child) => !isModule(child) && child.name !== PROPERTY),
  };
}

function groupOf(base: XmlElement): Group {
  const parts = partsOf(base);
  return { base, properties: parts.properties, rest: parts.rest, pending: [], children: [] };
}

function shapeOf(group: Group): XmlElement {
  return { ...group.base, children: group.properties };
}

function counterparts(groups: readonly Group[], module: XmlElement): Group[] {
  const sameName = groups.filter((group) => nameOf(group.base) === nameOf(module));
  const id = idOf(module);
  if (sameName.length === 1 || id === undefined) {
    return sameName;
  }
  return sameName.filter((group) => idOf(shapeOf(group)) === id);
}

function mergedProperties(
  base: readonly XmlElement[],
  other: readonly XmlElement[],
  otherWins: boolean,
): XmlElement[] {
  const merged = [...base];
  for (const property of other) {
    const at = merged.findIndex(({ attrs }) => attrs['name'] === property.attrs['name']);
    if (at === -1) {
      merged.push(property);
    } else if (otherWins) {
      merged[at] = property;
    }
  }
  return merged;
}

function absorb(group: Group, other: XmlElement, otherWins: boolean): void {
  const parts = partsOf(other);
  group.properties = mergedProperties(group.properties, parts.properties, otherWins);
  group.rest = [
    ...group.rest,
    ...parts.rest.filter(
      (node) => !group.rest.some((kept) => kept.attrs['key'] === node.attrs['key']),
    ),
  ];
  group.pending.push(other);
}

function feedModules(group: Group, other: XmlElement, otherWins: boolean): void {
  for (const module of partsOf(other).modules) {
    const matches = isFilter(module)
      ? []
      : counterparts(
          group.children.filter((child) => !isFilter(child.base)),
          module,
        );
    if (matches.length === 0) {
      group.children.push(groupOf(module));
    }
    for (const match of matches) {
      absorb(match, module, otherWins);
    }
  }
}

function expand(group: Group, otherWins: boolean): void {
  group.children = partsOf(group.base).modules.map(groupOf);
  for (const other of group.pending) {
    feedModules(group, other, otherWins);
  }
}

function mergeModule(base: XmlElement, other: XmlElement, otherWins: boolean): XmlElement {
  const root = groupOf(base);
  absorb(root, other, otherWins);
  const order = [root];
  for (const group of order) {
    expand(group, otherWins);
    appendAll(order, group.children);
  }
  const results = new Map<Group, XmlElement>();
  for (const group of order.toReversed()) {
    const modules = group.children.flatMap((child) => {
      const found = results.get(child);
      return found === undefined ? [] : [found];
    });
    results.set(group, {
      ...group.base,
      children: [...group.properties, ...group.rest, ...modules],
    });
  }
  return results.get(root) ?? base;
}

export function layerCheckstyle({ nitpickerText, projectText, projectWins }: LayerInput): string {
  const nitpicker = parseXml(nitpickerText);
  const project = withoutInlineFilters(parseXml(projectText));
  if (nameOf(project) !== 'Checker') {
    throw new Error(
      `The Checkstyle config must have a Checker module at its root, not ${project.attrs['name'] ?? ''}`,
    );
  }
  return `${DECLARATION}${renderXml(mergeModule(nitpicker, project, projectWins))}\n`;
}
