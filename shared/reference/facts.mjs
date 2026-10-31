import { docsUrl } from '../messages/docs-url.mjs';
import { exceptionAdvice, joinedWords, PRESET_TITLES, PRESETS } from './entry.mjs';

const BUILD_TITLES = { gradle: 'Gradle', maven: 'Maven' };
const FAMILY_TOOLS = new Set(['eslint']);
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/gu;
const CODE_SPAN = /`([^`]*)`/gu;
const ABSOLUTE_URL = /^[a-z]+:\/\//u;

/** The tools whose findings print this entry's rule. */
export function printedTools(entry) {
  return [entry.tool, ...(entry.findingTools ?? [])].filter((tool) => !FAMILY_TOOLS.has(tool));
}

/** The presets that can report the entry, in the order of the preset list. */
export function presetsOf(entry) {
  return PRESETS.filter((preset) => entry.analyzers[preset] !== undefined);
}

function byPresets(entry, valuesOf) {
  const presets = presetsOf(entry).filter((preset) => valuesOf(preset) !== undefined);
  const groups = Map.groupBy(presets, (preset) => valuesOf(preset).join(' '));
  return [...groups].map(([values, group]) => ({
    values: values === '' ? [] : values.split(' '),
    presets: group,
  }));
}

function titles(presets) {
  return joinedWords(presets.map((preset) => PRESET_TITLES[preset]));
}

function groupedText(entry, valuesOf, format) {
  const groups = byPresets(entry, valuesOf);
  if (groups.every(({ values }) => values.length === 0)) {
    return undefined;
  }
  return groups.length === 1
    ? joinedWords(groups[0].values.map(format))
    : groups
        .map(({ values, presets }) => `${joinedWords(values.map(format))} (${titles(presets)})`)
        .join('; ');
}

/** The analyzer names `disable` takes, with the presets each one serves. */
export function analyzersText(entry) {
  return groupedText(
    entry,
    (preset) => entry.analyzers[preset],
    (name) => `\`${name}\``,
  );
}

function buildsText(entry) {
  return entry.builds === undefined
    ? undefined
    : groupedText(
        entry,
        (preset) => entry.builds[preset],
        (build) => BUILD_TITLES[build],
      );
}

function formItems(forms) {
  const byMessage = Map.groupBy(forms, ({ message }) => message);
  return [...byMessage].map(([message, same]) => {
    const labels = same.flatMap(({ label }) => (label === undefined ? [] : [`\`${label}\``]));
    return labels.length === 0 ? message : `${labels.join(', ')}: ${message}`;
  });
}

/**
 * The GitHub URL of a file of this repository under `root` (see `docsRootUrl`), or undefined when
 * there is no root, as for a package whose package.json names no repository.
 */
export function repositoryUrl(relativePath, anchor, root) {
  return root === undefined ? undefined : docsUrl(relativePath, anchor, root);
}

/**
 * The URL of a link of `entryLinks`: the outside address, or a guide of this repository under
 * `root`, which is undefined without a root.
 */
export function linkUrl({ path, anchor, url }, root) {
  return url ?? repositoryUrl(path, anchor, root);
}

function toolDocumentation(entry) {
  return entry.links?.[0];
}

function guideTarget({ path, anchor }) {
  return anchor === undefined ? path : `${path}#${anchor}`;
}

/**
 * The allowed form of the entry, or a pointer to the tool's documentation of the rule, or to the
 * guide of this repository that describes it when the tool has none.
 */
export function allowedText(entry) {
  if (entry.allowed !== undefined) {
    return entry.allowed;
  }
  const documentation = toolDocumentation(entry);
  if (documentation !== undefined) {
    return `See the tool's documentation: [${documentation.label}](${documentation.url}).`;
  }
  const guide = entry.docs?.[0];
  return guide === undefined || entry.forms !== undefined
    ? undefined
    : `See the guide: [${guide.label}](${guideTarget(guide)}).`;
}

function presetFacts(entry, field, label) {
  const presets = presetsOf(entry).filter((preset) => entry[field]?.[preset] !== undefined);
  const groups = Map.groupBy(presets, (preset) => entry[field][preset]);
  return [...groups].map(([text, group]) => ({
    label: `${label} in ${joinedWords(group.map((preset) => PRESET_TITLES[preset]))}`,
    text,
  }));
}

function presetAllowedFacts(entry) {
  return [
    ...presetFacts(entry, 'messageIn', 'Message'),
    ...presetFacts(entry, 'allowedIn', 'Allowed form'),
  ];
}

/**
 * What the reference says about an entry in reading order: `{ label, text }`, `{ label, items }`
 * or `{ label, code, language }` facts. Texts are Markdown: code spans and links.
 */
export function entryFacts(entry) {
  const printed = printedTools(entry).map((tool) => `\`${tool}/${entry.rule}\``);
  const textFacts = [
    [
      'Printed as',
      printed.length > 1 || entry.pattern !== undefined || FAMILY_TOOLS.has(entry.tool)
        ? joinedWords(printed)
        : undefined,
    ],
    [
      'For example',
      entry.samples === undefined ? undefined : joinedWords(entry.samples.map((id) => `\`${id}\``)),
    ],
    ['Presets', joinedWords(presetsOf(entry).map((preset) => PRESET_TITLES[preset]))],
    ['Analyzers', analyzersText(entry)],
    ['Builds', buildsText(entry)],
    ['Scope', entry.scope],
    ['Why it is on', entry.why],
    ['Allowed form', allowedText(entry)],
  ]
    .filter(([, text]) => text !== undefined)
    .map(([label, text]) => ({ label, text }));
  const example =
    entry.example === undefined ? [] : [{ label: 'Example of the allowed form', ...entry.example }];
  const closing = [
    ['Threshold', entry.limit],
    ['Exception', exceptionAdvice(entry, presetsOf(entry))],
  ]
    .filter(([, text]) => text !== undefined)
    .map(([label, text]) => ({ label, text }));
  const forms = entry.forms ?? [];
  return [
    ...textFacts,
    ...presetAllowedFacts(entry),
    ...example,
    ...closing,
    ...(forms.length === 0 ? [] : [{ label: 'Allowed forms by message', items: formItems(forms) }]),
  ];
}

/** The links an entry names: guides in this repository first, then outside documentation. */
export function entryLinks(entry) {
  return [...(entry.docs ?? []), ...(entry.links ?? []).map(({ label, url }) => ({ label, url }))];
}

function linkText(label, target, root) {
  if (ABSOLUTE_URL.test(target)) {
    return `${label} (${target})`;
  }
  const [file, anchor] = target.split('#');
  const url = repositoryUrl(file, anchor, root);
  return url === undefined ? label : `${label} (${url})`;
}

/**
 * A Markdown text of the reference as a terminal prints it: no code-span backticks, and links as
 * their label and URL, with the guides of this repository under `root` (see `docsRootUrl`), or as
 * their label alone without a root.
 */
export function plainText(text, root) {
  return text
    .replaceAll(MARKDOWN_LINK, (_, label, target) => linkText(label, target, root))
    .replaceAll(CODE_SPAN, '$1');
}
