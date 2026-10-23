import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { changelogSection, changelogVersions } from './changelog-section.mjs';

const root = path.resolve(import.meta.dirname, '..');
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
  const text = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

  it('starts with an Unreleased section followed by releases, newest first', () => {
    const versions = changelogVersions(text);

    expect(versions[0]).toBe('Unreleased');
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('has a dated entry with content for the version in package.json', () => {
    expect(changelogSection(text, version), `no CHANGELOG.md entry for ${version}`).toMatch(/\S/u);
    expect(text).toMatch(
      new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'mu'),
    );
  });

  it('defines a link for every heading', () => {
    for (const heading of changelogVersions(text)) {
      expect(text, `no link definition for [${heading}]`).toContain(`\n[${heading}]: https://`);
    }
  });

  it('prints the entry of a version from the command line', () => {
    const printed = execFileSync(
      process.execPath,
      [path.join(root, 'scripts/changelog-section.mjs'), version],
      { encoding: 'utf8' },
    );

    expect(printed.trim()).toBe(changelogSection(text, version));
  });

  it('fails for a version without an entry', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/changelog-section.mjs'), '99.0.0'],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CHANGELOG.md has no entry for 99.0.0');
  });
});
