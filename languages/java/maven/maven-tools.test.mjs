import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPinnedTools } from '../builds/java-build.mjs';
import { formatTool, resolveTools, toolDependencies } from './maven-tools.mjs';

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

function resolvedWith(javaStyle) {
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
      extraTools: formatTool(javaStyle, pinned),
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
});
