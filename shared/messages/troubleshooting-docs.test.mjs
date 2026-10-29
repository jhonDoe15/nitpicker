import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TROUBLESHOOTING_FILE, troubleshootingUrl } from './troubleshooting.mjs';
import {
  anchorsLinkedFrom,
  files,
  pageEntries,
  read,
  root,
  sectionOf,
} from './test-support/troubleshooting-page.mjs';

const EVERY_PRESET = [
  'exit-code-2-and-tool-errors',
  'no-merge-base',
  'tests-fail',
  'tests-fail-on-the-base',
  'another-run-is-in-progress',
  'a-policy-loosened-finding',
];
const SECTION_LINK = /\]\(troubleshooting\.md#([a-z0-9-]+)\)/gu;
const PROJECT_TOOL_CONFIG = 'a-project-tool-config-is-missing-or-broken';
const WINDOWS = 'windows-and-wsl';
const PRESET_GUIDES = [
  {
    guide: 'docs/java-preset.md',
    sections: ['Java and Kotlin'],
    others: [PROJECT_TOOL_CONFIG],
  },
  {
    guide: 'docs/kotlin-preset.md',
    sections: ['Java and Kotlin'],
    without: ['the-maven-build-fails', 'error-prone-cannot-find-a-jdk'],
    others: [PROJECT_TOOL_CONFIG],
  },
  { guide: 'docs/python-preset.md', sections: ['Python'], others: [PROJECT_TOOL_CONFIG, WINDOWS] },
  {
    guide: 'docs/typescript-strict-preset.md',
    sections: ['TypeScript and JavaScript', 'Tests'],
    others: [PROJECT_TOOL_CONFIG, WINDOWS],
  },
];
const entries = pageEntries();
const entrySlugs = entries.map(({ slug }) => slug);

function expectedIndex({ sections, without = [], others }) {
  const inSections = entries
    .filter(({ section }) => sections.includes(section))
    .map(({ slug }) => slug)
    .filter((slug) => !without.includes(slug));
  return [...new Set([...inSections, ...others, ...EVERY_PRESET])].toSorted();
}

describe('the links to the page from the documentation', () => {
  const documents = [
    'README.md',
    'CHANGELOG.md',
    ...files('docs', (name) => name.endsWith('.md')),
    ...files('skills', (name) => name.endsWith('.md')),
  ];

  it('point at headings that exist', () => {
    const linked = anchorsLinkedFrom(documents);

    expect(linked.length).toBeGreaterThan(20);
    expect(linked.filter(({ anchor }) => !entrySlugs.includes(anchor))).toEqual([]);
  });

  it('is linked from the README, the usage guide, the agent snippet and the changelog', () => {
    const unlinked = [
      'README.md',
      'docs/usage.md',
      'docs/agents-snippet.md',
      'CHANGELOG.md',
    ].filter((file) => !read(file).includes(path.basename(TROUBLESHOOTING_FILE)));

    expect(unlinked).toEqual([]);
  });

  it('is linked by its full URL from every skill', () => {
    const pageUrl = troubleshootingUrl(undefined);
    const unlinked = readdirSync(path.join(root, 'skills')).filter(
      (skill) => !read(`skills/${skill}/SKILL.md`).includes(`(${pageUrl})`),
    );

    expect(unlinked).toEqual([]);
  });
});

describe('the troubleshooting section of each preset guide', () => {
  it.each(PRESET_GUIDES)('lists the entries $guide meets, and only those', (preset) => {
    const section = sectionOf(read(preset.guide), '## Troubleshooting');
    const listed = [...new Set([...section.matchAll(SECTION_LINK)].map(([, anchor]) => anchor))];

    expect(section).toContain('](troubleshooting.md#');
    expect(listed.toSorted()).toEqual(expectedIndex(preset));
  });

  it('is where the usage guide sends each preset, instead of a list of its own', () => {
    const usage = read('docs/usage.md');
    const sent = [...usage.matchAll(/^Troubleshooting: [^\n]*\n\[[^\]]+\]\(([^)]+)\)/gmu)].map(
      ([, target]) => target,
    );

    expect([...new Set(sent)].toSorted()).toEqual(
      PRESET_GUIDES.map(({ guide }) => `${path.basename(guide)}#troubleshooting`).toSorted(),
    );
  });
});
