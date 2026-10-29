import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../cli.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { changelogSection, changelogVersions, runChangelogCommand } from './changelog.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const SAMPLE = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '- Something new.',
  '',
  '## [1.2.3] - 2026-01-02',
  '',
  '### Fixed',
  '',
  '- Something broken.',
  '',
  '[Unreleased]: https://example.test/compare/v1.2.3...HEAD',
  '[1.2.3]: https://example.test/releases/tag/v1.2.3',
  '',
].join('\n');
const text = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const STATIC_IMPORT = /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s)?['"]([^'"]+)['"]/gmu;

const COPIED = ['core', 'shared', 'languages', 'package.json', 'CHANGELOG.md'];
const NOT_COPIED = /[\\/](?:node_modules|fixtures)(?:[\\/]|$)/u;

function packagesImportedFrom(entry) {
  const visit = (file, seen) => {
    if (seen.has(file)) {
      return [];
    }
    seen.add(file);
    const specifiers = [...readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)].map(([, s]) => s);
    return specifiers.flatMap((specifier) => {
      if (specifier.startsWith('.')) {
        return visit(path.resolve(path.dirname(file), specifier), seen);
      }
      return specifier.startsWith('node:') ? [] : [`${path.relative(root, file)}: ${specifier}`];
    });
  };
  return visit(entry, new Set());
}

function changelogWithoutPackages(arguments_) {
  const copy = mkdtempSync(path.join(tmpdir(), 'nitpicker-changelog-copy-'));
  try {
    for (const entry of COPIED) {
      cpSync(path.join(root, entry), path.join(copy, entry), {
        recursive: true,
        filter: (source) => !NOT_COPIED.test(source),
      });
    }
    const result = spawnSync(
      process.execPath,
      [path.join(copy, 'core/cli.mjs'), 'changelog', ...arguments_],
      { encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } },
    );
    return { status: result.status, stderr: result.stderr };
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

function changelogCli(...arguments_) {
  const output = captureOutput();
  const exitCode = runCli({
    arguments_: ['changelog', ...arguments_],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, stdout: output.stdoutText, stderr: output.stderrText };
}

describe('changelogSection', () => {
  it('returns the heading and the text up to the next heading', () => {
    expect(changelogSection(SAMPLE, 'Unreleased')).toEqual({
      heading: '## [Unreleased]',
      body: '### Added\n\n- Something new.',
    });
  });

  it('stops the last section at the link definitions', () => {
    expect(changelogSection(SAMPLE, '1.2.3')).toEqual({
      heading: '## [1.2.3] - 2026-01-02',
      body: '### Fixed\n\n- Something broken.',
    });
  });

  it('takes a version with a leading v and Unreleased in any case', () => {
    expect(changelogSection(SAMPLE, 'v1.2.3')).toEqual(changelogSection(SAMPLE, '1.2.3'));
    expect(changelogSection(SAMPLE, 'unreleased')).toEqual(changelogSection(SAMPLE, 'Unreleased'));
    expect(changelogSection(SAMPLE, 'UNRELEASED')).toEqual(changelogSection(SAMPLE, 'Unreleased'));
  });

  it('returns undefined for a version without an entry', () => {
    expect(changelogSection(SAMPLE, '9.9.9')).toBeUndefined();
  });

  it('lists the versions in order', () => {
    expect(changelogVersions(SAMPLE)).toEqual(['Unreleased', '1.2.3']);
  });
});

describe('CHANGELOG.md', () => {
  const versions = changelogVersions(text);
  const lines = text.split('\n');

  it('starts with an Unreleased section followed by releases, each once', () => {
    expect(versions[0]).toBe('Unreleased');
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('has a dated entry with content for the version in package.json', () => {
    const heading = lines.find((line) => line.startsWith(`## [${version}]`));

    expect(heading?.replace(/\d{4}-\d{2}-\d{2}$/u, '<date>')).toBe(`## [${version}] - <date>`);
    expect(changelogSection(text, version)?.body.length ?? 0).toBeGreaterThan(0);
  });

  it('defines a link for every heading', () => {
    const defined = lines.flatMap((line) => /^\[([^\]]+)\]: https:\/\//u.exec(line)?.[1] ?? []);

    expect(defined).toEqual(versions);
  });
});

function printed(version) {
  const { heading, body } = changelogSection(text, version);
  return `${heading}\n\n${body}\n`;
}

describe('nitpicker changelog', () => {
  it('prints the heading, the date and the entry of the installed version without an argument', () => {
    expect(changelogCli()).toEqual({ exitCode: 0, stdout: printed(version), stderr: '' });
    expect(changelogCli().stdout.split('\n')[0]).toMatch(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/u);
  });

  it('prints the entry of the version it is given, with or without a leading v', () => {
    expect(changelogCli('Unreleased')).toEqual({
      exitCode: 0,
      stdout: printed('Unreleased'),
      stderr: '',
    });
    expect(changelogCli(`v${version}`)).toEqual(changelogCli(version));
    expect(changelogCli('unreleased')).toEqual(changelogCli('Unreleased'));
  });

  it('fails for a version without an entry and lists the versions it has', () => {
    expect(changelogCli('99.0.0')).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: `nitpicker: CHANGELOG.md has no entry for 99.0.0. Versions: ${changelogVersions(text).join(', ')}\n`,
    });
  });

  it('fails for an entry that is there but empty', () => {
    const packageRoot = mkdtempSync(path.join(tmpdir(), 'changelog-'));
    writeFileSync(
      path.join(packageRoot, 'CHANGELOG.md'),
      '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-02\n\n- First.\n',
    );
    const output = captureOutput();

    try {
      expect(
        runChangelogCommand({
          commandArguments: ['Unreleased'],
          stdout: output.stdout,
          stderr: output.stderr,
          packageRoot,
        }),
      ).toBe(2);
      expect(output.stderrText).toBe(
        'nitpicker: CHANGELOG.md has an empty entry for Unreleased. Versions: Unreleased, 1.0.0\n',
      );
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  it('prints its usage for --help and rejects options and more than one version', () => {
    expect(changelogCli('--help')).toEqual({
      exitCode: 0,
      stdout: 'Usage: nitpicker changelog [<version>]\n',
      stderr: '',
    });
    expect(changelogCli('1.0.0', '2.0.0')).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'nitpicker failed: Usage: nitpicker changelog [<version>]\n',
    });
  });

  it('loads no installed package, so a release job can run it before npm ci', () => {
    expect(packagesImportedFrom(path.join(root, 'core/cli.mjs'))).toEqual([]);
    expect(changelogWithoutPackages([version])).toEqual({ status: 0, stderr: '' });
  });
});
