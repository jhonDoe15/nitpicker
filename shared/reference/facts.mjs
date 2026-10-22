import { docsUrl } from '../messages/docs-url.mjs';
import { exceptionAdvice, PRESET_TITLES, PRESETS } from './entry.mjs';

const BUILD_TITLES = { gradle: 'Gradle', maven: 'Maven' };
const FAMILY_TOOLS = new Set(['eslint']);

/** The tools whose findings print this entry's rule. */
export function printedTools(entry) {
  return [entry.tool, ...(entry.findingTools ?? [])].filter((tool) => !FAMILY_TOOLS.has(tool));
}

/** The presets that can report the entry, in the order of the preset list. */
export function presetsOf(entry) {
  return PRESETS.filter((preset) => entry.analyzers[preset] !== undefined);
}

function joined(words) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** The analyzer names `disable` takes, with the presets each one serves. */
export function analyzersText(entry) {
  if (presetsOf(entry).every((preset) => entry.analyzers[preset].length === 0)) {
    return undefined;
  }
  const byAnalyzers = Map.groupBy(presetsOf(entry), (preset) => entry.analyzers[preset].join(' '));
  const groups = [...byAnalyzers].map(([names, presets]) => ({
    names: names.split(' ').map((name) => `\`${name}\``),
    presets: presets.map((preset) => PRESET_TITLES[preset]),
  }));
  return groups.length === 1
    ? joined(groups[0].names)
    : groups.map(({ names, presets }) => `${joined(names)} (${joined(presets)})`).join('; ');
}

function formItems(forms) {
  const byMessage = Map.groupBy(forms, ({ message }) => message);
  return [...byMessage].map(([message, same]) => {
    const labels = same.flatMap(({ label }) => (label === undefined ? [] : [`\`${label}\``]));
    return labels.length === 0 ? message : `${labels.join(', ')}: ${message}`;
  });
}

/** The URL of a link of `entryLinks`: a guide of this repository on GitHub, or the outside address. */
export function linkUrl({ path, anchor, url }) {
  return url ?? docsUrl(path, anchor);
}

/** What the reference says about an entry, as `{ label, text }` or `{ label, items }` facts in reading order. */
export function entryFacts(entry) {
  const printed = printedTools(entry).map((tool) => `\`${tool}/${entry.rule}\``);
  const facts = [
    [
      'Printed as',
      printed.length > 1 || entry.pattern !== undefined || FAMILY_TOOLS.has(entry.tool)
        ? joined(printed)
        : undefined,
    ],
    ['Presets', joined(presetsOf(entry).map((preset) => PRESET_TITLES[preset]))],
    ['Analyzers', analyzersText(entry)],
    [
      'Builds',
      entry.builds === undefined
        ? undefined
        : joined(entry.builds.map((build) => BUILD_TITLES[build])),
    ],
    ['Scope', entry.scope],
    ['Why it is on', entry.why],
    ['Allowed form', entry.allowed],
    ['Threshold', entry.limit],
    ['Exception', exceptionAdvice(entry)],
  ]
    .filter(([, text]) => text !== undefined)
    .map(([label, text]) => ({ label, text }));
  const forms = entry.forms ?? [];
  return forms.length === 0
    ? facts
    : [...facts, { label: 'Allowed forms by message', items: formItems(forms) }];
}

/** The links an entry names: guides in this repository first, then outside documentation. */
export function entryLinks(entry) {
  return [...(entry.docs ?? []), ...(entry.links ?? []).map(({ label, url }) => ({ label, url }))];
}
