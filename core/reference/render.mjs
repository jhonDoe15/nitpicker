import path from 'node:path';
import { entryFacts, entryLinks } from '../../shared/reference/facts.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { pageCredits } from './credits.mjs';
import { pageExceptionTexts } from './page-exceptions.mjs';

const REFERENCE_DIRECTORY = 'docs/rules';
const INDEX_FILE = 'README.md';
const CODE_OR_LINK = /(`[^`]*`|\[[^\]]+\]\([^)\s]+\))/u;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/u;
const ABSOLUTE_URL = /^[a-z]+:\/\//u;
const SPECIAL = /[*<]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu;

const COMMON_LABELS = ['Presets', 'Analyzers', 'Builds', 'Scope', 'Why it is on'];
const COMMON_SHARE = 0.6;
const MINIMUM_ENTRIES = 5;
const SENTENCE_END = /[.!?]$/u;

function escaped(text) {
  return text.replaceAll(SPECIAL, '\\$&');
}

function pageTarget(target) {
  if (ABSOLUTE_URL.test(target)) {
    return target;
  }
  const [file, anchor] = target.split('#');
  return `${path.posix.relative(REFERENCE_DIRECTORY, file)}${anchor === undefined ? '' : `#${anchor}`}`;
}

function markedPart(part) {
  const link = LINK.exec(part);
  return link === null ? part : `[${escaped(link[1])}](${pageTarget(link[2])})`;
}

function markdownText(text) {
  return text
    .split(CODE_OR_LINK)
    .map((part, index) => (index % 2 === 1 ? markedPart(part) : escaped(part)))
    .join('');
}

function sentence(text) {
  const capitalized = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  return SENTENCE_END.test(capitalized) ? capitalized : `${capitalized}.`;
}

function relativeLink({ label, path: target, anchor, url }) {
  const href =
    url ??
    `${path.posix.relative(REFERENCE_DIRECTORY, target)}${anchor === undefined ? '' : `#${anchor}`}`;
  return `[${label}](${href})`;
}

function isGuide({ path: target, anchor }, guide) {
  return target !== undefined && `${target}${anchor === undefined ? '' : `#${anchor}`}` === guide;
}

function commonFacts(factsList) {
  if (factsList.length < MINIMUM_ENTRIES) {
    return [];
  }
  return COMMON_LABELS.flatMap((label) => {
    const texts = factsList.map((facts) => facts.find((fact) => fact.label === label)?.text);
    const counts = Map.groupBy(
      texts.filter((text) => text !== undefined),
      (text) => text,
    );
    const [modal, members] = [...counts].toSorted((a, b) => b[1].length - a[1].length)[0] ?? [];
    return members !== undefined && members.length >= COMMON_SHARE * factsList.length
      ? [{ label, text: modal }]
      : [];
  });
}

function codeLines(code, language) {
  return [
    '',
    `  \`\`\`${language}`,
    ...code.split('\n').map((line) => (line === '' ? '' : `  ${line}`)),
    '  ```',
    '',
  ];
}

function factLines({ label, text, items, code, language }) {
  if (code !== undefined) {
    return [`- **${label}:**`, ...codeLines(code, language)];
  }
  return items === undefined
    ? [`- **${label}:** ${markdownText(text)}`]
    : [`- **${label}:**`, ...items.map((item) => `  - ${markdownText(item)}`)];
}

function entryMarkdown(entry, { common, guide }) {
  const facts = entryFacts(entry).filter(
    (fact) => !common.some(({ label, text }) => label === fact.label && text === fact.text),
  );
  const links = entryLinks(entry).filter((link) => !isGuide(link, guide));
  return [
    `<a id="${entry.anchor}"></a>`,
    '',
    `### \`${entry.id}\``,
    '',
    markdownText(sentence(entry.summary)),
    '',
    ...facts.flatMap(factLines),
    ...(links.length === 0 ? [] : [`- **See also:** ${links.map(relativeLink).join(', ')}`]),
    '',
  ];
}

function pageMarkdown(page, entries, { credit, exceptions }) {
  const common = commonFacts(entries.map(entryFacts));
  return [
    `# ${page.title}`,
    '',
    `${page.summary} This page lists ${String(entries.length)} ${entries.length === 1 ? 'rule' : 'rules'}. [All pages](${INDEX_FILE}).`,
    '',
    `The guide for these rules: ${relativeLink({ label: page.guide, path: page.guide.split('#')[0], anchor: page.guide.split('#')[1] })}.`,
    '',
    ...(credit === undefined ? [] : [markdownText(credit), '']),
    ...(exceptions === undefined ? [] : [markdownText(exceptions), '']),
    ...(common.length === 0
      ? []
      : ['Unless an entry says otherwise:', '', ...common.flatMap(factLines), '']),
    ...entries.flatMap((entry) => entryMarkdown(entry, { common, guide: page.guide })),
  ].join('\n');
}

function tableRow(cells, widths) {
  return `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
}

function tableLines([header, ...rows]) {
  const widths = header.map((_, column) =>
    Math.max(...[header, ...rows].map((cells) => cells[column].length)),
  );
  return [
    tableRow(header, widths),
    tableRow(
      widths.map((width) => '-'.repeat(width)),
      widths,
    ),
    ...rows.map((cells) => tableRow(cells, widths)),
  ];
}

function indexMarkdown(byPage) {
  return [
    '# Rule reference',
    '',
    'Every rule that nitpicker can report, one entry each, with the preset that reports it, why it is on, the allowed form where it has one, and the `nitpicker.config.json` entry that accepts it. The pages are generated from the rule catalogs (`npm run gen:rules`) and a test fails when they are stale.',
    '',
    'From a terminal, `nitpicker explain <tool/rule>` prints one entry, and `nitpicker rules` lists the rules of the preset of the project. In the SARIF report and in the findings files (`new-findings.json`, `held-findings.json`, `resolved-findings.json`, and `findings.json` with `--all`), each finding whose rule has an entry here links to it with a `helpUri`, at the release tag of the installed version.',
    '',
    "Where an entry has no allowed form of its own, it links to the tool's page for the rule, or quotes the message the finding prints. PMD, Error Prone, NullAway, detekt, ruff and ESLint text is quoted from the pinned versions under their permissive licences; SpotBugs and Checkstyle are LGPL, so their entries name the rule and link to the tool's description.",
    '',
    'The reference covers the rules that fail the gate. Report-only measurements (metrics and coverage figures) and tool errors (a tool that could not run) are not rules and have no entry.',
    '',
    ...tableLines([
      ['Page', 'Rules', 'What it covers'],
      ...PAGES.map((page) => [
        `[${page.title}](${page.id}.md)`,
        String(byPage.get(page.id).length),
        page.summary,
      ]),
    ]),
    '',
  ].join('\n');
}

/** The Markdown files of the reference, by path relative to the repository root, as Prettier formats them. */
export function renderReference(
  entries,
  notes = { credits: pageCredits(), exceptions: pageExceptionTexts() },
) {
  const byPage = Map.groupBy(entries, ({ page }) => page);
  for (const page of PAGES) {
    byPage.set(page.id, byPage.get(page.id) ?? []);
  }
  return new Map([
    [`${REFERENCE_DIRECTORY}/${INDEX_FILE}`, indexMarkdown(byPage)],
    ...PAGES.map((page) => [
      `${REFERENCE_DIRECTORY}/${page.id}.md`,
      pageMarkdown(
        page,
        byPage.get(page.id).toSorted((a, b) => a.id.localeCompare(b.id)),
        { credit: notes.credits[page.id], exceptions: notes.exceptions[page.id] },
      ),
    ]),
  ]);
}
