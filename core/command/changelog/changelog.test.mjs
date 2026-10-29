import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../cli.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';
import { changelogSection, changelogVersions } from './changelog.mjs';

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
  it('returns the text between a version heading and the next heading', () => {
    expect(changelogSection(SAMPLE, 'Unreleased')).toBe('### Added\n\n- Something new.');
  });

  it('stops the last section at the link definitions', () => {
    expect(changelogSection(SAMPLE, '1.2.3')).toBe('### Fixed\n\n- Something broken.');
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
    expect(changelogSection(text, version)?.length ?? 0).toBeGreaterThan(0);
  });

  it('defines a link for every heading', () => {
    const defined = lines.flatMap((line) => /^\[([^\]]+)\]: https:\/\//u.exec(line)?.[1] ?? []);

    expect(defined).toEqual(versions);
  });
});

describe('nitpicker changelog', () => {
  it('prints the entry of the installed version without an argument', () => {
    expect(changelogCli()).toEqual({
      exitCode: 0,
      stdout: `${changelogSection(text, version)}\n`,
      stderr: '',
    });
  });

  it('prints the entry of the version it is given', () => {
    expect(changelogCli('Unreleased')).toEqual({
      exitCode: 0,
      stdout: `${changelogSection(text, 'Unreleased')}\n`,
      stderr: '',
    });
  });

  it('fails for a version without an entry and lists the versions it has', () => {
    expect(changelogCli('99.0.0')).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: `nitpicker: CHANGELOG.md has no entry for 99.0.0. Versions: ${changelogVersions(text).join(', ')}\n`,
    });
  });

  it('rejects options and more than one version', () => {
    expect(changelogCli('1.0.0', '2.0.0')).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: `nitpicker failed: Usage: nitpicker changelog [<version>]. ${linkSentence('invalidArguments')}\n`,
    });
  });
});
