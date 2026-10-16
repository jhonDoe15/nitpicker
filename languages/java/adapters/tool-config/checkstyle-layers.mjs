import { childrenNamed, parseXml } from '../../ingest/common.mjs';
import { renderXml } from './xml-write.mjs';

const DECLARATION =
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd">\n';
const INLINE_FILTERS = new Set([
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressionXpathFilter',
]);

function nameOf(module) {
  return module.attrs.name
    .split('.')
    .at(-1)
    .replace(/Check$/u, '');
}

function isModule(node) {
  return node.name === 'module';
}

function withoutInlineFilters(module) {
  return {
    ...module,
    children: module.children
      .filter((child) => !(isModule(child) && INLINE_FILTERS.has(nameOf(child))))
      .map((child) => (isModule(child) ? withoutInlineFilters(child) : child)),
  };
}

function idOf(module) {
  return childrenNamed(module, 'property').find(({ attrs }) => attrs.name === 'id')?.attrs.value;
}

function isFilter(module) {
  return nameOf(module).endsWith('Filter');
}

function counterpart(candidates, module) {
  const sameName = candidates.filter((other) => nameOf(other) === nameOf(module));
  const id = idOf(module);
  if (id === undefined) {
    return sameName.length === 1
      ? sameName[0]
      : sameName.find((other) => idOf(other) === undefined);
  }
  return sameName.find((other) => idOf(other) === id);
}

function mergedProperties(base, other, otherWins) {
  const merged = [...base];
  for (const property of other) {
    const at = merged.findIndex(({ attrs }) => attrs.name === property.attrs.name);
    if (at === -1) {
      merged.push(property);
    } else if (otherWins) {
      merged[at] = property;
    }
  }
  return merged;
}

function mergeModules(base, other, otherWins) {
  const result = [...base];
  const used = new Set();
  for (const module of other) {
    const match = isFilter(module)
      ? undefined
      : counterpart(
          result.filter((candidate) => !used.has(candidate) && !isFilter(candidate)),
          module,
        );
    if (match === undefined) {
      result.push(module);
    } else {
      used.add(match);
      result[result.indexOf(match)] = mergeModule(match, module, otherWins);
    }
  }
  return result;
}

function mergeModule(base, other, otherWins) {
  const parts = (module) => ({
    properties: childrenNamed(module, 'property'),
    modules: module.children.filter(isModule),
    rest: module.children.filter((child) => !isModule(child) && child.name !== 'property'),
  });
  const left = parts(base);
  const right = parts(other);
  return {
    ...base,
    children: [
      ...mergedProperties(left.properties, right.properties, otherWins),
      ...left.rest,
      ...right.rest.filter((node) => !left.rest.some((kept) => kept.attrs.key === node.attrs.key)),
      ...mergeModules(left.modules, right.modules, otherWins),
    ],
  };
}

export function layerCheckstyle({ nitpickerText, projectText, projectWins = true }) {
  const nitpicker = parseXml(nitpickerText);
  const project = withoutInlineFilters(parseXml(projectText));
  if (nameOf(project) !== 'Checker') {
    throw new Error(
      `The Checkstyle config must have a Checker module at its root, not ${project.attrs.name}`,
    );
  }
  return `${DECLARATION}${renderXml(mergeModule(nitpicker, project, projectWins))}\n`;
}
