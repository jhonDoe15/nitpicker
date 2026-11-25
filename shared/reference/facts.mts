import { docsUrl } from '../messages/docs-url.mts';
import { fixText } from './fix-status.mts';
import { exceptionAdvice, joinedWords, presetTitle, PRESETS } from './entry.mts';
import type {
  AllowedForm,
  DocsLink,
  FactLine,
  LinkTarget,
  OutsideLink,
  PresetValues,
  RuleEntry,
} from './typed/entry-types.mts';

const BUILD_TITLES: Readonly<Record<string, string>> = { gradle: 'Gradle', maven: 'Maven' };
const FAMILY_TOOLS = new Set(['eslint']);
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/gu;
const CODE_SPAN = /`([^`]*)`/gu;
const ABSOLUTE_URL = /^[a-z]+:\/\//u;

export function printedTools(entry: Pick<RuleEntry, 'tool' | 'findingTools'>): string[] {
  return [entry.tool, ...(entry.findingTools ?? [])].filter((tool) => !FAMILY_TOOLS.has(tool));
}

export function presetsOf(entry: Pick<RuleEntry, 'analyzers'>): string[] {
  return PRESETS.filter((preset) => entry.analyzers[preset] !== undefined);
}

function byPresets(
  entry: Pick<RuleEntry, 'analyzers'>,
  valuesOf: (preset: string) => readonly string[] | undefined,
): { values: string[]; presets: string[] }[] {
  const valued = presetsOf(entry).flatMap((preset) => {
    const values = valuesOf(preset);
    return values === undefined ? [] : [{ preset, values: values.join(' ') }];
  });
  const groups = Map.groupBy(valued, ({ values }) => values);
  return [...groups].map(([values, members]) => ({
    values: values === '' ? [] : values.split(' '),
    presets: members.map(({ preset }) => preset),
  }));
}

function titles(presets: readonly string[]): string {
  return joinedWords(presets.map(presetTitle));
}

function groupedText(
  entry: Pick<RuleEntry, 'analyzers'>,
  valuesOf: (preset: string) => readonly string[] | undefined,
  format: (value: string) => string,
): string | undefined {
  const groups = byPresets(entry, valuesOf);
  if (groups.every(({ values }) => values.length === 0)) {
    return undefined;
  }
  const [only] = groups;
  return only !== undefined && groups.length === 1
    ? joinedWords(only.values.map(format))
    : groups
        .map(({ values, presets }) => `${joinedWords(values.map(format))} (${titles(presets)})`)
        .join('; ');
}

export function analyzersText(entry: Pick<RuleEntry, 'analyzers'>): string | undefined {
  return groupedText(
    entry,
    (preset) => entry.analyzers[preset],
    (name) => `\`${name}\``,
  );
}

function buildsText(entry: Pick<RuleEntry, 'analyzers' | 'builds'>): string | undefined {
  const { builds } = entry;
  return builds === undefined
    ? undefined
    : groupedText(
        entry,
        (preset) => builds[preset],
        (build) => BUILD_TITLES[build] ?? build,
      );
}

function formItems(forms: readonly AllowedForm[]): string[] {
  const byMessage = Map.groupBy(forms, ({ message }) => message);
  return [...byMessage].map(([message, same]) => {
    const labels = same.flatMap(({ label }) => (label === undefined ? [] : [`\`${label}\``]));
    return labels.length === 0 ? message : `${labels.join(', ')}: ${message}`;
  });
}

export function repositoryUrl(
  relativePath: string,
  anchor: string | undefined,
  root: string | undefined,
): string | undefined {
  return root === undefined ? undefined : docsUrl(relativePath, anchor, root);
}

export function linkUrl({ path, anchor, url }: LinkTarget, root?: string): string | undefined {
  return url ?? (path === undefined ? undefined : repositoryUrl(path, anchor, root));
}

function toolDocumentation(entry: Pick<RuleEntry, 'links'>): OutsideLink | undefined {
  return entry.links?.[0];
}

function guideTarget({ path, anchor }: DocsLink): string {
  return anchor === undefined ? path : `${path}#${anchor}`;
}

export function allowedText(
  entry: Pick<RuleEntry, 'allowed' | 'links' | 'docs' | 'forms'>,
): string | undefined {
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

function presetFacts(
  entry: RuleEntry,
  field: 'messageIn' | 'allowedIn',
  label: string,
): { label: string; text: string }[] {
  const values: PresetValues<string> | undefined = entry[field];
  const present = presetsOf(entry).flatMap((preset) => {
    const text = values?.[preset];
    return text === undefined ? [] : [{ preset, text }];
  });
  const groups = Map.groupBy(present, ({ text }) => text);
  return [...groups].map(([text, group]) => ({
    label: `${label} in ${joinedWords(group.map(({ preset }) => presetTitle(preset)))}`,
    text,
  }));
}

function presetAllowedFacts(entry: RuleEntry): { label: string; text: string }[] {
  return [
    ...presetFacts(entry, 'messageIn', 'Message'),
    ...presetFacts(entry, 'allowedIn', 'Allowed form'),
  ];
}

function definedFacts(rows: readonly (readonly [string, string | undefined])[]): FactLine[] {
  return rows.flatMap(([label, text]) => (text === undefined ? [] : [{ label, text }]));
}

const BROAD_ORDER =
  'a broad pattern rule: reports list its findings after those of targeted rules, before style';

export function entryFacts(entry: RuleEntry): FactLine[] {
  const printed = printedTools(entry).map((tool) => `\`${tool}/${entry.rule}\``);
  const textRows: [string, string | undefined][] = [
    ['Labels', entry.labels?.join(', ')],
    ['Order', entry.tier === 'broad' ? BROAD_ORDER : undefined],
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
    ['Presets', joinedWords(presetsOf(entry).map(presetTitle))],
    ['Analyzers', analyzersText(entry)],
    ['Builds', buildsText(entry)],
    ['Scope', entry.scope],
    ['Why it is on', entry.why],
    ['Allowed form', allowedText(entry)],
    ['Fix', entry.fix === undefined ? undefined : fixText(entry, presetsOf(entry))],
  ];
  const textFacts = definedFacts(textRows);
  const example =
    entry.example === undefined ? [] : [{ label: 'Example of the allowed form', ...entry.example }];
  const closingRows: [string, string | undefined][] = [
    ['Threshold', entry.limit],
    ['Exception', exceptionAdvice(entry, presetsOf(entry))],
  ];
  const closing = definedFacts(closingRows);
  const forms = entry.forms ?? [];
  return [
    ...textFacts,
    ...presetAllowedFacts(entry),
    ...example,
    ...closing,
    ...(forms.length === 0 ? [] : [{ label: 'Allowed forms by message', items: formItems(forms) }]),
  ];
}

export function entryLinks(entry: Pick<RuleEntry, 'docs' | 'links'>): (DocsLink | OutsideLink)[] {
  return [...(entry.docs ?? []), ...(entry.links ?? []).map(({ label, url }) => ({ label, url }))];
}

function linkText(label: string, target: string, root: string | undefined): string {
  if (ABSOLUTE_URL.test(target)) {
    return `${label} (${target})`;
  }
  const [file = '', anchor] = target.split('#');
  const url = repositoryUrl(file, anchor, root);
  return url === undefined ? label : `${label} (${url})`;
}

export function plainText(text: string, root: string | undefined): string {
  return text
    .replaceAll(MARKDOWN_LINK, (_: string, label: string, target: string) =>
      linkText(label, target, root),
    )
    .replaceAll(CODE_SPAN, (_: string, code: string) => code);
}
