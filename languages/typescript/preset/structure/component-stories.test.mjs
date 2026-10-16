import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { componentStoryFindings } from './component-stories.mjs';

const temporaryRoots = [];
const storybookManifest = JSON.stringify({ devDependencies: { storybook: '^8.0.0' } });
const plainManifest = JSON.stringify({ devDependencies: { vitest: '^3.0.0' } });

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-component-stories-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function component(name) {
  return `export const ${name} = () => <div />;\n`;
}

function storied(directory, ...names) {
  return Object.fromEntries(
    names.flatMap((name) => [
      [`${directory}/${name}.tsx`, component(name)],
      [`${directory}/${name}.stories.tsx`, 'export default {};\n'],
    ]),
  );
}

function plain(directory, ...names) {
  return Object.fromEntries(names.map((name) => [`${directory}/${name}.tsx`, component(name)]));
}

function findingsOf(root, options = {}) {
  return componentStoryFindings({
    projectRoot: root,
    analyzerName: 'structure',
    layout: resolveLayout(options.layout),
    exceptions: options.exceptions ?? [],
    liveProjectRoot: options.liveProjectRoot,
  });
}

function summary(findings) {
  return findings.map(({ path: file, classification }) => [file, classification]);
}

describe('component stories', () => {
  it('reports nothing without Storybook', () => {
    const root = project({
      'package.json': plainManifest,
      ...storied('src', 'A', 'B', 'C'),
      ...plain('src', 'D'),
    });

    expect(findingsOf(root)).toEqual([]);
  });

  it('enforces a missing story when more than half of the components have one', () => {
    const root = project({
      'package.json': storybookManifest,
      ...storied('src', 'A', 'B', 'C'),
      ...plain('src', 'D'),
    });

    expect(summary(findingsOf(root))).toEqual([['src/D.tsx', 'enforceable']]);
  });

  it('reports without enforcing when half or fewer of the components have a story', () => {
    const root = project({
      'package.json': storybookManifest,
      ...storied('src', 'A', 'B'),
      ...plain('src', 'C', 'D'),
    });

    expect(summary(findingsOf(root))).toEqual([
      ['src/C.tsx', 'descriptive'],
      ['src/D.tsx', 'descriptive'],
    ]);
  });

  it('gives a component the same finding on both sides of the threshold', () => {
    const base = project({
      'package.json': storybookManifest,
      ...storied('src', 'A'),
      ...plain('src', 'B', 'C', 'D'),
    });
    const head = project({
      'package.json': storybookManifest,
      ...storied('src', 'A', 'B', 'C'),
      ...plain('src', 'D', 'E'),
    });
    const baseSide = findingsOf(base, { liveProjectRoot: head });
    const headSide = findingsOf(head);

    expect(summary(baseSide)).toEqual([
      ['src/B.tsx', 'enforceable'],
      ['src/C.tsx', 'enforceable'],
      ['src/D.tsx', 'enforceable'],
    ]);
    expect(summary(headSide)).toEqual([
      ['src/D.tsx', 'enforceable'],
      ['src/E.tsx', 'enforceable'],
    ]);
    expect(baseSide.find(({ path: file }) => file === 'src/D.tsx')).toEqual(
      headSide.find(({ path: file }) => file === 'src/D.tsx'),
    );
  });

  it('decides whether Storybook is present from the live checkout', () => {
    const base = project({ 'package.json': plainManifest, ...plain('src', 'A', 'B') });
    const head = project({
      'package.json': storybookManifest,
      ...storied('src', 'A'),
      ...plain('src', 'B'),
    });

    expect(summary(findingsOf(base, { liveProjectRoot: head }))).toEqual([
      ['src/A.tsx', 'descriptive'],
      ['src/B.tsx', 'descriptive'],
    ]);
    expect(findingsOf(head, { liveProjectRoot: base })).toEqual([]);
  });

  it('finds a story anywhere under the source roots of the package, in any story form', () => {
    const root = project({
      'package.json': storybookManifest,
      ...plain('src', 'A', 'B', 'C', 'D', 'F'),
      'src/components/Icon.tsx': component('Icon'),
      'src/A.stories.tsx': '',
      'src/__stories__/B.stories.tsx': '',
      'src/stories/C.stories.jsx': '',
      'src/stories/Icon.stories.tsx': '',
      'src/D.story.tsx': '',
      'src/F.stories.js': '',
      'src/G.mdx': '',
      ...plain('src', 'G'),
    });

    expect(summary(findingsOf(root))).toEqual([['src/G.tsx', 'enforceable']]);
  });

  it('does not take a story from another package', () => {
    const root = project({
      'package.json': plainManifest,
      'packages/ui/package.json': storybookManifest,
      'packages/docs/package.json': storybookManifest,
      ...storied('packages/ui/src', 'A', 'B'),
      ...plain('packages/ui/src', 'C'),
      'packages/docs/src/C.stories.tsx': '',
    });
    const layout = { sourceRoots: ['packages/ui/src', 'packages/docs/src'] };

    expect(summary(findingsOf(root, { layout }))).toEqual([
      ['packages/ui/src/C.tsx', 'enforceable'],
    ]);
  });

  it('reports each component of a file without a story at its own line', () => {
    const root = project({
      'package.json': storybookManifest,
      ...storied('src', 'A', 'B', 'C'),
      'src/Pair.tsx': `${component('Pair')}${component('PairItem')}`,
    });

    expect(
      findingsOf(root).map(({ identity, location, message }) => [identity, location, message]),
    ).toEqual([
      [
        'component-story-missing:Pair',
        { line: 1 },
        'Most components in this project have a story. Add src/Pair.stories.tsx for Pair. If this is intended, add {"rule":"component-story-missing","paths":["src/Pair.tsx"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
      [
        'component-story-missing:PairItem',
        { line: 2 },
        'Most components in this project have a story. Add src/Pair.stories.tsx for PairItem. If this is intended, add {"rule":"component-story-missing","paths":["src/Pair.tsx"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
  });

  it('names the story after any exported component, the file or the folder of an index file', () => {
    const root = project({
      'package.json': storybookManifest,
      'src/Card/index.tsx': component('Card'),
      'src/Card/Card.stories.tsx': '',
      'src/button.tsx': component('Button'),
      'src/Button.stories.tsx': '',
      'src/pair.tsx': `${component('Left')}${component('Right')}`,
      'src/Right.stories.tsx': '',
      'src/default.tsx': 'export default () => <div />;\n',
      'src/default.stories.tsx': '',
      ...plain('src', 'Other'),
    });

    expect(summary(findingsOf(root))).toEqual([['src/Other.tsx', 'enforceable']]);
  });

  it('counts only real components', () => {
    const root = project({
      'package.json': storybookManifest,
      ...storied('src', 'A'),
      'src/icons.tsx': 'export const ICONS = { a: <svg />, b: <svg /> };\n',
      'src/rows.tsx': 'export const Rows = [<tr />];\n',
      'src/helpers.tsx': 'export function renderRow() { return <tr />; }\n',
      'src/stories/Wide.stories.tsx': component('Wide'),
      'src/data.ts': 'export const Data = 1;\n',
    });

    expect(findingsOf(root)).toEqual([]);
  });

  it('reads Storybook from the nearest package.json of each component', () => {
    const root = project({
      'package.json': plainManifest,
      'packages/ui/package.json': storybookManifest,
      'packages/app/package.json': plainManifest,
      ...storied('packages/ui/src', 'A', 'B'),
      ...plain('packages/ui/src', 'C'),
      ...plain('packages/app/src', 'D', 'E'),
    });
    const layout = { sourceRoots: ['packages/ui/src', 'packages/app/src'] };

    expect(summary(findingsOf(root, { layout }))).toEqual([
      ['packages/ui/src/C.tsx', 'enforceable'],
    ]);
  });

  it('skips excepted files and says how to add an exception', () => {
    const root = project({
      'package.json': storybookManifest,
      ...storied('src', 'A', 'B'),
      ...plain('src', 'C', 'D'),
    });
    const exceptions = [
      { rule: 'component-story-missing', paths: ['src/C.tsx'], reason: 'internal' },
    ];
    const [finding, ...rest] = findingsOf(root, { exceptions });

    expect(rest).toEqual([]);
    expect(finding).toEqual({
      tool: 'structure',
      rule: 'component-story-missing',
      path: 'src/D.tsx',
      identity: 'component-story-missing:D',
      location: { line: 1 },
      message:
        'Most components in this project have a story. Add src/D.stories.tsx for D. If this is intended, add {"rule":"component-story-missing","paths":["src/D.tsx"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      classification: 'enforceable',
    });
  });

  it('words the message of a finding that is only reported', () => {
    const root = project({ 'package.json': storybookManifest, ...plain('src', 'A') });

    expect(findingsOf(root).map(({ message }) => message)).toEqual([
      'A has no story. Add src/A.stories.tsx. Not enforced until more than half of the components have one. If this is intended, add {"rule":"component-story-missing","paths":["src/A.tsx"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
});
