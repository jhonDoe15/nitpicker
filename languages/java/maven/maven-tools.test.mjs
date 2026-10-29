import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPinnedTools } from '../builds/java-build.mjs';
import {
  archunitTool,
  cacheDirectory,
  formatTool,
  publishDirectory,
  resolveTools,
  toolDependencies,
} from './maven-tools.mjs';

const roots = [];
const pinned = readPinnedTools();
const GOOGLE = {
  name: 'format',
  coordinates: [`com.google.googlejavaformat:google-java-format:${pinned.googleJavaFormat}`],
};
const PALANTIR = {
  name: 'format-palantir',
  coordinates: [`com.palantir.javaformat:palantir-java-format:${pinned.palantirJavaFormat}`],
};
const FAKE_MAVEN = [
  '#!/bin/sh',
  'previous=""',
  'for argument in "$@"; do',
  '  if [ "$previous" = "--file" ]; then pom="$argument"; fi',
  '  previous="$argument"',
  'done',
  'directory=$(dirname "$pom")',
  'for module in "$directory"/*/; do',
  '  printf "%s" "$pom" > "${module}classpath.txt"',
  'done',
  '',
].join('\n');

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function resolvedWith(javaStyle, spring = false) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-tools-')));
  roots.push(root);
  const maven = path.join(root, 'fake-mvn');
  writeFileSync(maven, FAKE_MAVEN);
  chmodSync(maven, 0o755);
  vi.stubEnv('XDG_CACHE_HOME', path.join(root, 'cache'));
  return Object.keys(
    resolveTools({
      projectRoot: root,
      maven,
      pinned,
      launcherVersions: [],
      extraTools: [...formatTool(javaStyle, pinned), ...archunitTool(spring, pinned)],
    }),
  );
}

describe('formatTool', () => {
  it('asks for the google-java-format jar for the google and aosp styles, and by default', () => {
    expect(formatTool('google', pinned)).toEqual([GOOGLE]);
    expect(formatTool('aosp', pinned)).toEqual([GOOGLE]);
    expect(formatTool(undefined, pinned)).toEqual([GOOGLE]);
  });

  it('asks for the palantir-java-format jar only for the palantir style, and for none when no formatter runs', () => {
    expect(formatTool('palantir', pinned)).toEqual([PALANTIR]);
    expect(formatTool('none', pinned)).toEqual([]);
  });
});

describe('archunitTool', () => {
  it('asks for the pinned ArchUnit jar only for a build with a module that runs the architecture rules', () => {
    expect([archunitTool(true, pinned), archunitTool(false, pinned)]).toEqual([
      [{ name: 'archunit', coordinates: [`com.tngtech.archunit:archunit:${pinned.archunit}`] }],
      [],
    ]);
  });
});

describe.skipIf(process.platform === 'win32')('cacheDirectory', () => {
  it('names a directory inside a private nitpicker directory under XDG_CACHE_HOME', () => {
    const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-cache-root-')));
    roots.push(home);
    vi.stubEnv('XDG_CACHE_HOME', home);
    const directory = cacheDirectory('spring-arch');
    const root = path.join(home, 'nitpicker');

    expect([directory, statSync(root).mode & 0o077]).toEqual([path.join(root, 'spring-arch'), 0]);
  });
});

describe('toolDependencies', () => {
  it('carries no formatter of its own, so a style that does not need one resolves none', () => {
    expect(Object.keys(toolDependencies(pinned))).toEqual([
      'pmd',
      'spotbugs',
      'checkstyle',
      'errorprone',
      'jacoco',
      'pit',
      'pit-junit5',
      'pit-testng',
    ]);
    expect(Object.keys(toolDependencies(pinned, [], formatTool('palantir', pinned)))).toEqual([
      'pmd',
      'spotbugs',
      'checkstyle',
      'errorprone',
      'jacoco',
      'pit',
      'pit-junit5',
      'pit-testng',
      'format-palantir',
    ]);
  });
});

describe.skipIf(process.platform === 'win32')('resolveTools', () => {
  const common = [
    'pmd',
    'spotbugs',
    'checkstyle',
    'errorprone',
    'jacoco',
    'pit',
    'pit-junit5',
    'pit-testng',
  ];

  it('resolves the google jar for google, the palantir jar for palantir and no formatter for none', () => {
    expect(resolvedWith('google')).toEqual([...common, 'format']);
    expect(resolvedWith('palantir')).toEqual([...common, 'format-palantir']);
    expect(resolvedWith('none')).toEqual(common);
  });

  it('resolves ArchUnit with the other tools, under its own cache key, when a module uses Spring', () => {
    expect(resolvedWith('google', true)).toEqual([...common, 'format', 'archunit']);
  });
});

describe('publishing a staged cache folder', () => {
  function staged(name, text) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-publish-'));
    roots.push(root);
    const folder = path.join(root, name);
    mkdirSync(folder);
    writeFileSync(path.join(folder, 'marker'), text);
    return { root, folder };
  }

  it('moves the staging folder to the target', () => {
    const { root, folder } = staged('staging', 'new');
    const target = path.join(root, 'target');

    publishDirectory(folder, target);

    expect([existsSync(folder), readFileSync(path.join(target, 'marker'), 'utf8')]).toEqual([
      false,
      'new',
    ]);
  });

  it('keeps the target another run published first and drops its own staging folder', () => {
    const { root, folder } = staged('staging', 'late');
    const target = path.join(root, 'target');
    mkdirSync(target);
    writeFileSync(path.join(target, 'marker'), 'first');
    writeFileSync(path.join(target, 'other'), 'kept');

    publishDirectory(folder, target);

    expect([existsSync(folder), readFileSync(path.join(target, 'marker'), 'utf8')]).toEqual([
      false,
      'first',
    ]);
  });

  it('rethrows when the move fails and no target exists', () => {
    const { root } = staged('unused', '');

    expect(() => {
      publishDirectory(path.join(root, 'missing'), path.join(root, 'target'));
    }).toThrow(/ENOENT/u);
  });
});
