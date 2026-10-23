import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  declaredConfigFiles,
  declaredToolChoices,
  declaredToolDigest,
  declaredToolNotices,
} from './declared-choices.mjs';
import { directorySource } from './declared-build.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-declared-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const FILTER = '<FindBugsFilter><Match><Bug pattern="EI_EXPOSE_REP"/></Match></FindBugsFilter>';
const BUILD = `spotbugs {
  effort = 'max'
  excludeFilter = file('config/spotbugs/exclude.xml')
}
`;
const HEAD = { 'build.gradle': BUILD, 'config/spotbugs/exclude.xml': FILTER };
const choicesOf = (root, precedence, policyRoot = root) =>
  declaredToolChoices(root, { toolPrecedence: { spotbugs: precedence }, policyRoot });

describe('the SpotBugs settings a run takes from the build', () => {
  it('reads nothing by default, and the head build for every ordering that lists "project"', () => {
    const head = projectWith(HEAD);
    const base = projectWith({ 'build.gradle': '' });
    const filter = path.join(head, 'config/spotbugs/exclude.xml');

    expect(choicesOf(base, ['nitpicker'], head)).toEqual({});
    expect(choicesOf(base, ['project'], head).spotbugs.arguments).toEqual([
      '-effort:max',
      '-medium',
      '-exclude',
      filter,
    ]);
    expect(choicesOf(base, ['project', 'nitpicker'], head).spotbugs.arguments).toEqual([
      '-effort:max',
      '-medium',
      '-exclude',
      filter,
    ]);
    expect(choicesOf(base, ['nitpicker', 'project'], head).spotbugs).toEqual({
      arguments: ['-effort:default', '-medium', '-exclude', filter],
      files: [filter],
    });
  });

  it('fails when the build declares no SpotBugs settings', () => {
    const root = projectWith({ 'build.gradle': "plugins { id 'java' }\n" });

    expect(() => choicesOf(root, ['project'])).toThrow(
      /^"tools.spotbugs.precedence" lists "project" but SpotBugs settings in the build .* is missing: create it, or remove "project" from tools.spotbugs.precedence$/u,
    );
  });

  it('fails for a filter that is missing, not XML, not a filter or not a path it can read', () => {
    const missing = projectWith({ 'build.gradle': BUILD });
    const malformed = projectWith({ ...HEAD, 'config/spotbugs/exclude.xml': '<FindBugsFilter>' });
    const other = projectWith({ ...HEAD, 'config/spotbugs/exclude.xml': '<ruleset/>' });
    const dynamic = projectWith({ 'build.gradle': 'spotbugs { excludeFilter = file(shared) }\n' });
    const brokenPom = projectWith({ ...HEAD, 'pom.xml': '<project>' });

    expect(() => choicesOf(missing, ['project'])).toThrow(
      '"tools.spotbugs.precedence" lists "project" but config/spotbugs/exclude.xml (the SpotBugs exclude filter build.gradle names) is missing',
    );
    expect(() => choicesOf(malformed, ['project'])).toThrow(
      'The SpotBugs exclude filter config/spotbugs/exclude.xml is not valid XML: XML element <FindBugsFilter> is not closed',
    );
    expect(() => choicesOf(other, ['project'])).toThrow(
      'The SpotBugs exclude filter config/spotbugs/exclude.xml has <ruleset> as its root element; SpotBugs reads <FindBugsFilter>',
    );
    expect(() => choicesOf(dynamic, ['project'])).toThrow(
      'Could not resolve the SpotBugs exclude filter in build.gradle (excludeFilter = file(shared))',
    );
    expect(() => choicesOf(brokenPom, ['project'])).toThrow(
      'Could not read pom.xml: XML element <project> is not closed',
    );
  });

  it('digests the settings and the filter contents, so an edit of either changes the cache key', () => {
    const root = projectWith(HEAD);
    const before = declaredToolDigest({ spotbugs: ['project'] }, root);
    writeFileSync(path.join(root, 'config/spotbugs/exclude.xml'), `${FILTER}\n`);

    expect(declaredToolDigest({ spotbugs: ['project'] }, root)).not.toBe(before);
    expect(declaredToolDigest({ spotbugs: ['project'] }, projectWith({}))).toMatch(
      /lists "project" but SpotBugs settings/u,
    );
  });
});

describe('the notices about SpotBugs settings in the build', () => {
  const lowered = {
    'pom.xml':
      '<project><build><plugins><plugin><artifactId>spotbugs-maven-plugin</artifactId><configuration><effort>Min</effort><includeFilterFile>i.xml</includeFilterFile></configuration></plugin></plugins></build></project>',
  };

  it('says the settings are ignored without the opt-in', () => {
    const root = projectWith(HEAD);

    expect(declaredToolNotices({ preset: 'java' }, directorySource(root))).toEqual([
      'Ignoring the SpotBugs settings in build.gradle; opt in with "tools": { "spotbugs": { "precedence": ["project", "nitpicker"] } }',
    ]);
  });

  it('lists the settings an opted-in run does not apply', () => {
    const root = projectWith(lowered);
    const config = { tools: { spotbugs: { precedence: ['project'] } } };

    expect(declaredToolNotices(config, directorySource(root))).toEqual([
      'SpotBugs runs with effort default and threshold medium, plus your exclude filters; not applied from your build: effort min (pom.xml), includeFilter i.xml (pom.xml)',
    ]);
    expect(declaredToolNotices(config, directorySource(projectWith(HEAD)))).toEqual([]);
    expect(declaredToolNotices({}, directorySource(projectWith({ 'build.gradle': '' })))).toEqual(
      [],
    );
  });
});

describe('the files that hold the SpotBugs settings', () => {
  it('names each build file with its settings and the filter files they name', () => {
    const root = projectWith({ ...HEAD, 'lib/build.gradle': 'dependencies { }\n' });
    const found = declaredConfigFiles('spotbugs', {
      root,
      files: ['build.gradle', 'lib/build.gradle', 'config/spotbugs/exclude.xml'],
    });

    expect([...found.declarations.keys()]).toEqual(['build.gradle']);
    expect(JSON.parse(found.declarations.get('build.gradle'))).toEqual([
      { setting: 'effort', value: 'max' },
      { setting: 'excludeFilter', path: 'config/spotbugs/exclude.xml' },
    ]);
    expect(found.files).toEqual(['config/spotbugs/exclude.xml']);
  });
});
